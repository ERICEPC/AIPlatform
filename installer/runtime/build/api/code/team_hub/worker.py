"""Bounded dynamic orchestration. No automatic retries of business actions."""
import json
import logging
import signal
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from uuid import uuid4
from sqlalchemy import text
from . import contracts, store, runtime

log = logging.getLogger('team_hub.worker')


class RunStopped(Exception):
    pass


class Orchestrator:
    def __init__(self, app, job, pool, invoke=runtime.invoke):
        self.app, self.job, self.pool, self.invoke = app, job, pool, invoke
        self.cfg = job['config']; self.round = 0
        self.deadline = time.monotonic()+self.cfg['timeout']
        self.active = []

    def check(self):
        row = store.rows('SELECT state,cancelled FROM raccoon_team_runs WHERE id=:id', id=self.job['id'])[0]
        if row['cancelled'] or row['state'] != 'running':
            raise RunStopped('cancelled')
        if time.monotonic() >= self.deadline:
            raise RunStopped('timed_out')

    def start(self, aid, query, director=False):
        self.check(); sid = str(uuid4())
        store.run('''INSERT INTO raccoon_team_steps(id,run_id,kind,agent_id,snapshot_id,round,task,started_at)
          VALUES(:id,:run,:kind,:agent,:snapshot,:round,:task,:now)''', id=sid, run=self.job['id'],
          kind='director' if director else 'expert', agent=aid, snapshot=self.cfg['agents'][aid]['snapshot_id'],
          round=self.round, task=query, now=time.time())
        future = self.pool.submit(self.invoke, self.app, self.job, sid, aid, query, director)
        item = (future, sid, aid, query); self.active.append(item)
        return item

    def collect(self, items):
        pending = {item[0]: item for item in items}; results = []
        while pending:
            self.check()
            finished, _ = wait(pending, timeout=.25, return_when=FIRST_COMPLETED)
            for future in finished:
                _, sid, aid, query = pending.pop(future)
                try:
                    value = future.result(); state = 'succeeded'; code = ''
                except Exception as exc:
                    value = ''; state = 'failed'; code = 'agent_failed'
                    log.warning('step=%s failed type=%s', sid, type(exc).__name__)
                store.run("UPDATE raccoon_team_steps SET state=:state,result=:result,error_code=:code,finished_at=:now WHERE id=:id AND state='running'",
                          id=sid, state=state, result=value, code=code, now=time.time())
                results.append(dict(agent_id=aid, task=query, state=state, result=value, error_code=code))
        return results

    def execute(self):
        evidence = []; calls = 0
        try:
            for round_no in range(self.cfg['max_rounds']+1):
                self.round = round_no+1; self.check()
                final_only = round_no == self.cfg['max_rounds'] or calls >= self.cfg['max_calls']
                payload = dict(goal=self.cfg['goal'], output_requirements=self.cfg['output'], user_task=self.job['query'],
                    conversation_history=self.job.get('context') or [],
                    experts=[dict(**m, name=self.cfg['agents'][m['agent_id']]['name']) for m in self.cfg['members']],
                    results=evidence, remaining_expert_calls=self.cfg['max_calls']-calls, final_only=final_only)
                if final_only:
                    payload['instruction'] = '现在必须返回 final。明确指出失败或未完成的部分，不可再分配任务。'
                text_query = json.dumps(payload, ensure_ascii=False)
                if len(text_query.encode()) > 160000:
                    raise ValueError('context_limit')
                director = self.collect([self.start(self.cfg['leader_id'], text_query, True)])[0]
                if director['state'] != 'succeeded':
                    raise ValueError('director_failed')
                decision = contracts.plan(director['result'], {m['agent_id'] for m in self.cfg['members']}, self.cfg['max_calls']-calls, final_only)
                if decision['action'] == 'final':
                    if not calls:
                        raise ValueError('no_expert_called')
                    changed = store.run("""UPDATE raccoon_team_runs SET state='succeeded',answer=:answer,finished_at=:now
                        WHERE id=:id AND state='running' AND cancelled=false""", id=self.job['id'], answer=decision['answer'], now=time.time())
                    if not changed:
                        self.finish('cancelled', 'cancelled')
                    return
                tasks = decision['tasks']; calls += len(tasks)
                for offset in range(0, len(tasks), self.cfg['parallelism']):
                    evidence.extend(self.collect([self.start(task['agent_id'], task['query']) for task in tasks[offset:offset+self.cfg['parallelism']]]))
            raise ValueError('round_limit')
        except RunStopped as exc:
            self.finish(str(exc), str(exc))
        except Exception as exc:
            code = str(exc) if isinstance(exc, ValueError) and str(exc) in {'invalid_plan','unknown_expert','director_failed','context_limit','no_expert_called','round_limit'} else 'runtime_error'
            log.warning('run=%s failed type=%s code=%s', self.job['id'], type(exc).__name__, code)
            self.finish('failed', code)

    def finish(self, state, code):
        store.run("UPDATE raccoon_team_runs SET state=:state,error_code=:code,finished_at=:now WHERE id=:id AND state='running'",
                  id=self.job['id'], state=state, code=code, now=time.time())
        try:
            runtime.stop_steps(self.app, self.job['id'])
        except Exception as exc:
            log.warning('run=%s stop signal failed type=%s', self.job['id'], type(exc).__name__)
        for future, *_ in self.active:
            future.cancel()
        store.run("UPDATE raccoon_team_steps SET state=:state,error_code=:code,finished_at=:now WHERE run_id=:id AND state='running'", id=self.job['id'], state=state, code=code, now=time.time())


def main():
    from app_factory import create_app
    created = create_app()
    app = created[1] if isinstance(created, tuple) else created
    shutdown = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: shutdown.set())
    with store.engine().connect() as lease:
        if not lease.execute(text('SELECT pg_try_advisory_lock(732401926)')).scalar():
            raise RuntimeError('another team worker is active')
        lease.commit()
        # A restart never repeats a potentially state-changing expert action.
        for row in store.rows("SELECT id FROM raccoon_team_runs WHERE state='running'"):
            runtime.stop_steps(app, row['id'])
        store.run("UPDATE raccoon_team_steps SET state='interrupted',error_code='worker_restarted',finished_at=:now WHERE state='running'", now=time.time())
        store.run("UPDATE raccoon_team_runs SET state='interrupted',error_code='worker_restarted',finished_at=:now WHERE state='running'", now=time.time())
        with ThreadPoolExecutor(max_workers=4, thread_name_prefix='team-agent') as calls, ThreadPoolExecutor(max_workers=2, thread_name_prefix='team-run') as teams:
            running = {}
            while not shutdown.is_set():
                lease.execute(text('SELECT 1')); lease.commit()
                running = {f:j for f,j in running.items() if not f.done()}
                store.run("UPDATE raccoon_team_runs SET state='timed_out',error_code='queue_expired',finished_at=:now WHERE state='queued' AND created_at<:cutoff", now=time.time(), cutoff=time.time()-300)
                if len(running) < 2:
                    job = store.claim()
                    if job:
                        running[teams.submit(Orchestrator(app, job, calls).execute)] = job
                shutdown.wait(.5)
            for job in running.values():
                store.run('UPDATE raccoon_team_runs SET cancelled=true WHERE id=:id', id=job['id'])
                runtime.stop_steps(app, job['id'])


if __name__ == '__main__':
    logging.basicConfig(level=logging.WARNING)
    main()
