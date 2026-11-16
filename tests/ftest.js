require('../src/geom.js');const P=globalThis.Poly,{V,P2}=P;
function pip(pt,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function sdist(pt,poly){let m=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ab=P2.sub(b,a),t=Math.max(0,Math.min(1,P2.dot(P2.sub(pt,a),ab)/P2.dot(ab,ab)));m=Math.min(m,P2.len(P2.sub(pt,P2.add(a,P2.mul(ab,t)))));}return pip(pt,poly)?m:-m;}
function check(id,L,t,relief,style){
  const S=P.solid(id),g=P.fingerGeom(S,L,t,{style,relief,fingerW:0,fit:0}),n=S.sides,a=g.a,ideal=P.ngon(n,a);
  // frames: 2D -> 3D for each face, vertex k <-> f.v[k]
  const fr=S.faces.map(f=>{const c=V.mul(f.c,L),U=V.norm(V.sub(V.mul(S.verts[f.v[0]],L),c)),W=V.cross(f.n,U),th0=Math.atan2(ideal[0][1],ideal[0][0]);
    return{c,n:f.n,to3:(q,dep)=>{const r=Math.hypot(q[0],q[1]),an=Math.atan2(q[1],q[0])-th0;return V.add(c,V.add(V.add(V.mul(U,r*Math.cos(an)),V.mul(W,r*Math.sin(an))),V.mul(f.n,-dep)));},
      to2:X=>{const v=V.sub(X,c),x=V.dot(v,U),y=V.dot(v,W),r=Math.hypot(x,y),an=Math.atan2(y,x)+th0;return[[r*Math.cos(an),r*Math.sin(an)],-V.dot(v,f.n)];}};});
  // sanity: 3D map of ideal vertex matches solid vertex
  S.faces.forEach((f,fi)=>f.v.forEach((vi,k)=>{const e=V.len(V.sub(fr[fi].to3(ideal[k],0),V.mul(S.verts[vi],L)));if(e>1e-6)throw'map '+e;}));
  let coll=0,maxPen=0,protr=0,rs=1;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};
  const bb=P.bbox([g.poly]);
  for(let fa=0;fa<S.faces.length;fa++){
    for(let s2=0;s2<60000;s2++){
      const q=[bb.x0+rnd()*bb.w,bb.y0+rnd()*bb.h];
      // focus near boundary
      if(sdist(q,ideal)>4*t)continue; const dA=sdist(q,g.poly); if(dA<0.002*t)continue;
      const dep=0.002*t+rnd()*0.996*t, X=fr[fa].to3(q,dep);
      // protrusion outside solid
      let out=-Infinity;S.faces.forEach(f=>{out=Math.max(out,V.dot(X,f.n)-S.r*L);}); if(out>1e-6)protr=Math.max(protr,out);
      for(let fb=0;fb<S.faces.length;fb++){if(fb===fa)continue;const[q2,d2]=fr[fb].to2(X);if(d2<0.002*t||d2>0.998*t)continue;const dB=sdist(q2,g.poly);if(dB>0.002*t){coll++;maxPen=Math.max(maxPen,Math.min(dA,dB));}}
    }
  }
  return{coll,maxPen,protr,N:g.N,U:g.U,v:g.v};
}
module.exports=check;
if(require.main===module){
 for(const id of ['tetra','cube','octa','dodeca','icosa'])for(const style of['flush','full']){
   const row=[];for(const rf of[0]){const r=check(id,80,3,rf*3,style);row.push(`r${rf}t:${r.coll}${r.protr>1e-6?' p'+r.protr.toFixed(2):''}`);}
   console.log(id.padEnd(7),style.padEnd(6),row.join('  '));}
}
