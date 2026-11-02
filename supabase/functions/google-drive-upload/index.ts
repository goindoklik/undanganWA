import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
const join=(parts:Uint8Array[])=>{const size=parts.reduce((n,p)=>n+p.length,0);const out=new Uint8Array(size);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 const jwt=auth.startsWith("Bearer ")?auth.slice(7):"";
 const url=Deno.env.get("SUPABASE_URL")!;
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!jwt||!anon||!service) return json({error:"Konfigurasi autentikasi server belum lengkap."},500);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+jwt}}});
 const {data:{user},error:userError}=await userClient.auth.getUser(jwt);
 if(userError||!user) return json({error:"Sesi admin tidak valid. Silakan login kembali."},401);
 const admin=createClient(url,service);
 const {data:adminRow,error:adminError}=await admin.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
 if(adminError||!adminRow) return json({error:"Akses hanya untuk admin."},403);
 const clientId=Deno.env.get("GOOGLE_CLIENT_ID"),clientSecret=Deno.env.get("GOOGLE_CLIENT_SECRET"),refreshToken=Deno.env.get("GOOGLE_REFRESH_TOKEN");
 if(!clientId||!clientSecret||!refreshToken) return json({error:"Koneksi Google Drive belum lengkap. Periksa GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REFRESH_TOKEN."},503);
 let body:{event_id?:string;file_name?:string;image_base64?:string};
 try{body=await req.json()}catch{return json({error:"Format permintaan tidak valid."},400)}
 if(!body.event_id||! /^[0-9a-f-]{36}$/i.test(body.event_id)||!body.image_base64) return json({error:"Data acara atau gambar tidak valid."},400);
 const encoded=body.image_base64.replace(/^data:image\/png;base64,/,"");
 if(encoded.length>12_000_000) return json({error:"Ukuran gambar terlalu besar (maksimal sekitar 9 MB)."},413);
 let bytes:Uint8Array;
 try{const raw=atob(encoded);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));}catch{return json({error:"Data gambar tidak dapat dibaca."},400)}
 const tokenRes=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})});
 const token=await tokenRes.json();
 if(!tokenRes.ok||!token.access_token) return json({error:"Google Drive menolak token. Periksa atau ulangi otorisasi Google Drive."},502);
 const boundary="uw_"+crypto.randomUUID().replaceAll("-","");
 const safeName=(body.file_name||("Undangan-"+body.event_id+".png")).replace(/[\\/]/g,"-");
 const metadata={name:safeName,mimeType:"image/png",parents:["1b5TmeQ16QWwWCTz6fCG5mIXw_hJ55B35"]};
 const enc=new TextEncoder();
 const multipart=join([enc.encode("--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: image/png\r\n\r\n"),bytes,enc.encode("\r\n--"+boundary+"--")]);
 const upload=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType",{method:"POST",headers:{Authorization:"Bearer "+token.access_token,"Content-Type":"multipart/related; boundary="+boundary},body:multipart});
 const file=await upload.json();
 if(!upload.ok||!file.id) return json({error:"Upload ke Google Drive gagal: "+String(file.error?.message||"unknown")},502);
 const perm=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"/permissions",{method:"POST",headers:{Authorization:"Bearer "+token.access_token,"Content-Type":"application/json"},body:JSON.stringify({type:"anyone",role:"reader"})});
 if(!perm.ok){await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id),{method:"DELETE",headers:{Authorization:"Bearer "+token.access_token}});return json({error:"File terunggah tetapi izin tautan publik gagal dibuat. Periksa kebijakan berbagi Google Drive."},502);}
 const publicUrl="https://drive.google.com/uc?export=download&id="+encodeURIComponent(file.id);
 const {error:updateError}=await admin.from("invite_campaigns").update({invitation_image_url:publicUrl}).eq("id",body.event_id);
 if(updateError)return json({error:"File tersimpan di Drive, tetapi tautan gagal disimpan ke data acara.",file_id:file.id},500);
 return json({ok:true,file_id:file.id,name:file.name,url:publicUrl,web_view_link:file.webViewLink||("https://drive.google.com/file/d/"+file.id+"/view")});
});