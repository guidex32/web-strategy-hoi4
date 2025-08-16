const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static('public'));

let users = JSON.parse(fs.readFileSync('data/users.json','utf-8')); // {login,password,role,token}
let countries = JSON.parse(fs.readFileSync('data/countries.json','utf-8')); // {id,name,x,y,owner,economy,army,points,status}
let logs = [];

function saveUsers(){ fs.writeFileSync('data/users.json',JSON.stringify(users,null,2)); }
function saveCountries(){ fs.writeFileSync('data/countries.json',JSON.stringify(countries,null,2)); }

function genToken(){ return Math.random().toString(36).substr(2); }
function findUserByToken(token){ return users.find(u=>u.token===token); }

app.post('/api/auth',(req,res)=>{
  const {op,login,password} = req.body;
  if(op==='register'){
    if(users.find(u=>u.login===login)) return res.json({ok:false,message:'Логин занят'});
    const user = {login,password,role:'player',token:genToken()};
    users.push(user); saveUsers();
    return res.json({ok:true,user});
  }
  if(op==='login'){
    const user = users.find(u=>u.login===login && u.password===password);
    if(!user) return res.json({ok:false,message:'Неверные данные'});
    user.token=genToken(); saveUsers();
    return res.json({ok:true,user,token:user.token});
  }
  if(op==='session'){
    const token = req.headers['authorization']?.split(' ')[1];
    const user = findUserByToken(token);
    if(user) return res.json({user,token});
    return res.json({ok:false});
  }
  res.json({ok:false});
});

app.get('/api/countries',(req,res)=>{
  const token = req.headers['authorization']?.split(' ')[1];
  if(!findUserByToken(token)) return res.json([]);
  res.json(countries);
});

app.post('/api',(req,res)=>{
  const token = req.headers['authorization']?.split(' ')[1];
  const user = findUserByToken(token);
  if(!user) return res.json({ok:false,message:'Нет доступа'});
  const {op,...data} = req.body;

  if(op==='create_country'){
    if(user.role!=='owner') return res.json({ok:false,message:'Только овнер'});
    const id = Date.now().toString();
    const newC = {...data,id,owner:user.login,economy:0,army:{tank:0,pvo:0},points:0,status:'мир'};
    countries.push(newC); saveCountries();
    logs.push({time:Date.now(),action:'create_country',user:user.login,name:data.name});
    return res.json({ok:true});
  }
  if(op==='assign_owner'){
    if(user.role!=='owner') return res.json({ok:false,message:'Только овнер'});
    const c = countries.find(c=>c.id===data.countryId); if(!c) return res.json({ok:false,message:'Страна не найдена'});
    c.owner = data.login; saveCountries();
    logs.push({time:Date.now(),action:'assign_owner',user:user.login,countryId:data.countryId,newOwner:data.login});
    return res.json({ok:true});
  }
  if(op==='give_points'){
    const c = countries.find(c=>c.id===data.countryId); if(!c) return res.json({ok:false,message:'Страна не найдена'});
    c.points = (c.points||0)+parseInt(data.amount); saveCountries();
    logs.push({time:Date.now(),action:'give_points',user:user.login,countryId:data.countryId,amount:data.amount});
    return res.json({ok:true});
  }
  if(op==='logs'){
    if(user.role!=='admin' && user.role!=='owner') return res.json({ok:false,message:'Нет доступа'});
    return res.json({logs});
  }
  // сюда можно добавить остальные операции (экономика, армия, атака)
  res.json({ok:false,message:'Неизвестная операция'});
});

app.listen(PORT,()=>console.log('Server running on',PORT));
