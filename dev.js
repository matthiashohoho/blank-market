const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||".");const h=require(path.join(root,'api/game.js'));
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/game')){let b='';req.on('data',c=>b+=c);req.on('end',async()=>{req.body=JSON.parse(b||'{}');
    const r={status(c){res.statusCode=c;return r;},json(o){res.setHeader('content-type','application/json');res.end(JSON.stringify(o));},setHeader(k,v){res.setHeader(k,v);}};await h(req,r);});return;}
  res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'index.html')));
}).listen(3456,()=>console.log('up'));
