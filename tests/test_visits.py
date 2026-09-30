import sys, tempfile, unittest, json, sqlite3, io
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'notification-service'))
import visit_details as details
import visit_notify as server

class Handler:
    path='/visit'
    client_address=('127.0.0.1',1)
    connection=type('Connection',(),{'settimeout':lambda self,n:None})()
    def __init__(self,data,path='/visit'):
        self.path=path
        body=json.dumps(data).encode();self.rfile=io.BytesIO(body)
        self.headers={'Content-Length':str(len(body)),'Content-Type':'application/json','User-Agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0','X-Forwarded-For':'192.0.2.1'}
    def reply(self,status,data):self.status=status;self.data=data

class Visits(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.db=str(Path(self.temp.name)/'visits.db');self.calls=[]
        self.config={'TELEGRAM_BOT_TOKEN':'test-only','TELEGRAM_CHAT_ID':'test-only'}
        self.data={'id':'a'*32,'page':'esperienza','consent':True,'visitor':'b'*32,'count':3,'sections':['esperienza'],'services':list(details.SERVICES)[:1],'events':['demo-listen'],'seconds':30}
    def tearDown(self):self.temp.cleanup()
    def run_request(self,data,path='/visit'):
        h=Handler(data,path)
        def telegram(config,method,payload):self.calls.append((method,payload));return {'message_id':12}
        with patch.object(server,'DB',self.db),patch.object(details,'telegram',telegram):details.handle(h,self.db,server.PAGES,self.config,server.reserve)
        return h
    def test_same_message_update_and_revocation(self):
        h=self.run_request(self.data);self.assertEqual(h.status,200);self.assertEqual(len(h.data['token']),64)
        self.assertIn('Windows',self.calls[0][1]['text']);self.assertIn('visita 3',self.calls[0][1]['text'])
        update={**self.data,'token':h.data['token'],'events':['demo-listen','phone']}
        self.assertEqual(self.run_request(update,'/visit/update').status,429)
        with sqlite3.connect(self.db) as db:db.execute('UPDATE summaries SET updated=0')
        self.assertEqual(self.run_request(update,'/visit/update').status,200)
        self.assertEqual(self.calls[-1][0],'editMessageText');self.assertEqual(self.calls[-1][1]['message_id'],12)
        revoke={'id':self.data['id'],'page':'esperienza','token':h.data['token'],'consent':False}
        self.assertEqual(self.run_request(revoke,'/visit/update').status,200)
        self.assertNotIn('OTC-B',self.calls[-1][1]['text']);self.assertNotIn('Windows',self.calls[-1][1]['text'])
        with sqlite3.connect(self.db) as db:
            summary,agent=db.execute('SELECT summary,agent FROM summaries').fetchone();self.assertNotIn('visitor',summary);self.assertEqual(agent,'')
    def test_update_requires_secret(self):
        self.run_request(self.data)
        bad={**self.data,'token':'c'*64}
        self.assertEqual(self.run_request(bad,'/visit/update').status,403);self.assertEqual(len(self.calls),1)
    def test_invalid_data_not_sent(self):
        for payload in [None,[],{**self.data,'events':['private text']},{**self.data,'count':True},{**self.data,'visitor':'name'},{**self.data,'consent':False}]:
            self.assertEqual(self.run_request(payload).status,400)
        self.assertEqual(self.calls,[])
    def test_legacy_and_duplicate(self):
        baseline={'id':'d'*32,'page':'inizio'}
        self.assertEqual(self.run_request(baseline).data['status'],'sent')
        self.assertEqual(self.run_request(baseline).data['status'],'duplicate');self.assertEqual(len(self.calls),1)
        self.assertNotIn('Windows',self.calls[0][1]['text'])
    def test_delivery_failure_can_retry(self):
        h=Handler(self.data)
        with patch.object(server,'DB',self.db),patch.object(details,'telegram',side_effect=RuntimeError()):details.handle(h,self.db,server.PAGES,self.config,server.reserve)
        self.assertEqual(h.status,503);self.assertEqual(self.run_request(self.data).data['status'],'sent')
    def test_device_parsing(self):
        self.assertEqual(details.device('Mozilla iPhone CriOS Mobile Safari'),'Telefono · Chrome · iOS / iPadOS')
        self.assertEqual(details.device('Mozilla Macintosh Edg/ Safari'),'Computer · Edge · macOS')

if __name__=='__main__':unittest.main()
