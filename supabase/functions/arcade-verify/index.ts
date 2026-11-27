// The build script packages the exact browser game engines beside this file.
import {loadGame,simulation,eventIndex} from './engine/replay.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers:cors});
 const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:cors});
 if(request.method!=='POST')return reply(405,{error:'method'});
 try{
  const token=request.headers.get('authorization');
  if(!token)return reply(401,{error:'authentication_required'});
  const {room}=await request.json();
  if(typeof room!=='string'||!/^[-0-9a-f]{36}$/i.test(room))return reply(400,{error:'invalid_room'});
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  async function call(fn:string,body:unknown,key:string,bearer:string){
   const res=await fetch(url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{authorization:bearer,apikey:key,'content-type':'application/json'},body:JSON.stringify(body)});
   if(!res.ok)throw Error('rpc_failed');return res.json();
  }
  // Membership is checked by PostgreSQL with the caller's token.
  const state=await call('arcade_room',{p_action:'state',p_data:{room}},anon,token);
  if(state.status==='finished')return reply(200,{verified:true});
  if(state.status!=='playing'||Date.parse(state.now)<Date.parse(state.deadline)+1000)return reply(409,{error:'match_in_progress'});
  const engine=simulation(state,await loadGame(state.game));
  engine.advance(state.seconds*60,eventIndex(state.events),state.players);
  const result=await call('arcade_verify_commit',{p_room:room,p_scores:state.players.map((p:{slot:number})=>engine.score(p.slot))},service,'Bearer '+service);
  return reply(200,result);
 }catch{return reply(400,{error:'unable_to_verify_match'});}
});
