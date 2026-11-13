"""Single-lease native OKR worker."""
import signal,threading

def main():
 from .entrypoint import app,store,auth
 from .native_executor import NativeExecutor
 from .worker import Worker
 shutdown=threading.Event()
 for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,lambda *_:shutdown.set())
 with app.app_context():Worker(store,NativeExecutor(),auth.principal_active).serve(shutdown)

if __name__=='__main__':main()
