import json
import os
import httpx
from .common import ChannelError


class Answer:
    """Keep Agent progress separate from its authoritative final answer.

    Agent BETA emits agent_message deltas for progress, then message chunks
    containing the final answer. Combining the two repeats the answer. Plain
    chat message deltas and legacy agent_message-only streams still work.
    HTTP 200 / first token is not a successful run: message_end is required.
    """
    def __init__(self):
        self.text='';self.conversation_id='';self.done=False
        self.agent_text='';self.has_final=False

    def accept(self, event):
        if not isinstance(event,dict):
            raise ChannelError('incomplete')
        kind=event.get('event')
        if kind=='error':
            raise ChannelError('runtime')
        if event.get('conversation_id'):
            self.conversation_id=event['conversation_id']
        if kind=='message':
            self.has_final=True
            self.text+=event.get('answer') or ''
        elif kind=='agent_message':
            self.agent_text+=event.get('answer') or ''
        elif kind=='message_replace':
            self.has_final=True
            self.text=event.get('answer') or ''
        elif kind=='message_end':
            self.done=True
        if max(len(self.text.encode()),len(self.agent_text.encode()))>160000:
            raise ChannelError('too_long')

    def result(self):
        text=self.text if self.has_final else self.agent_text
        if not self.done or not text.strip():
            raise ChannelError('incomplete')
        return text.strip(),self.conversation_id


async def ask(token,query,user,conversation_id):
    url=os.environ.get('CHANNEL_AGENT_API_URL','http://api:5001/v1/chat-messages')
    answer=Answer();data=[]
    async with httpx.AsyncClient(timeout=httpx.Timeout(180,connect=10),trust_env=False) as client:
        async with client.stream('POST',url,headers={'Authorization':'Bearer '+token},json=dict(
            inputs={},query=query,user=user,conversation_id=conversation_id,response_mode='streaming',auto_generate_name=False)) as response:
            if response.status_code!=200:
                raise ChannelError('runtime')
            async for line in response.aiter_lines():
                if line.startswith('data:'):
                    data.append(line[5:].lstrip())
                elif not line and data:
                    payload='\n'.join(data);data=[]
                    if payload=='[DONE]':break
                    try:answer.accept(json.loads(payload))
                    except (json.JSONDecodeError,TypeError):raise ChannelError('incomplete') from None
                    if answer.done:break
    return answer.result()


def chunks(text,limit=3500):
    """UTF-8 safe pieces, comfortably below the smallest channel text limit."""
    parts=[];part=[];size=0
    for char in text:
        width=len(char.encode())
        if size+width>limit:
            parts.append(''.join(part));part=[];size=0
        part.append(char);size+=width
    if part:parts.append(''.join(part))
    return parts
