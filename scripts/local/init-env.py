from pathlib import Path
import secrets,json,base64,hmac,hashlib,time
root=Path(__file__).resolve().parents[2]
p=root/'.local-db.env'
if not p.exists():
 p.write_text('FINORA_DB_PASSWORD='+secrets.token_hex(24)+'\nFINORA_JWT_SECRET='+secrets.token_hex(32)+'\n')
 p.chmod(0o600)
values=dict(line.split('=',1) for line in p.read_text().splitlines())
def jwt(role):
 enc=lambda obj:base64.urlsafe_b64encode(json.dumps(obj,separators=(',',':')).encode()).rstrip(b'=').decode()
 data=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'role':role,'iss':'supabase','iat':int(time.time()),'exp':int(time.time())+315360000})
 return data+'.'+base64.urlsafe_b64encode(hmac.new(values['FINORA_JWT_SECRET'].encode(),data.encode(),hashlib.sha256).digest()).rstrip(b'=').decode()
# Never overwrite a pre-existing application configuration.
p=root/'.env.local'
if not p.exists():
 p.write_text('NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY='+jwt('anon')+'\nSUPABASE_SERVICE_ROLE_KEY='+jwt('service_role')+'\nCRON_SECRET='+secrets.token_hex(32)+'\n')
 p.chmod(0o600)
