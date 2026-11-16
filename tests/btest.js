require('../src/geom.js');const P=globalThis.Poly,{V,P2}=P;
function pip(pt,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function sd(pt,poly){let m=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ab=P2.sub(b,a),tt=Math.max(0,Math.min(1,P2.dot(P2.sub(pt,a),ab)/P2.dot(ab,ab)));m=Math.min(m,P2.len(P2.sub(pt,P2.add(a,P2.mul(ab,tt)))));}return pip(pt,poly)?m:-m;}
function run(id,L,t,style){
  const S=P.solid(id),g=P.fingerGeom(S,L,t,{style,fingerW:0,fit:0}),n=S.sides,ideal=P.ngon(n,g.a);
  const outer=g.outer||g.poly, inner=g.inner||g.poly;
  const at=z=>outer.map((q,i)=>[q[0]+(inner[i][0]-q[0])*z/t,q[1]+(inner[i][1]-q[1])*z/t]);
  const th0=Math.atan2(ideal[0][1],ideal[0][0]);
  const fr=S.faces.map(f=>{const c=V.mul(f.c,L),U=V.norm(V.sub(V.mul(S.verts[f.v[0]],L),c)),W=V.cross(f.n,U);
    return{to3:(q,dep)=>{const r=Math.hypot(q[0],q[1]),an=Math.atan2(q[1],q[0])-th0;return V.add(c,V.add(V.add(V.mul(U,r*Math.cos(an)),V.mul(W,r*Math.sin(an))),V.mul(f.n,-dep)));},
      to2:X=>{const v=V.sub(X,c),x=V.dot(v,U),y=V.dot(v,W),r=Math.hypot(x,y),an=Math.atan2(y,x)+th0;return[[r*Math.cos(an),r*Math.sin(an)],-V.dot(v,f.n)];}};});
  const inPlate=(fb,X,eps)=>{const[q,d]=fr[fb].to2(X);if(d<eps||d>t-eps)return false;return sd(q,at(d))>eps;};
  let rs=7;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};
  let coll=0,protr=0,voids=0,zone=0;const bb=P.bbox([ideal]),eps=0.004*t;
  for(let fa=0;fa<S.faces.length;fa++)for(let s2=0;s2<30000;s2++){
    const q=[bb.x0+rnd()*bb.w,bb.y0+rnd()*bb.h]; if(sd(q,ideal)>3*t||sd(q,ideal)<-3*t)continue;
    const dep=rnd()*t, X=fr[fa].to3(q,dep);
    let out=-Infinity;S.faces.forEach(f=>{out=Math.max(out,V.dot(X,f.n)-S.r*L);});
    const inA=inPlate(fa,X,eps);
    if(inA){ if(out>1e-6)protr=Math.max(protr,out); for(let fb=0;fb<S.faces.length;fb++)if(fb!==fa&&inPlate(fb,X,eps))coll++; }
    // void check: point inside the solid and within face A's slab, but in nobody's plate (skip near vertices)
    if(out<-eps && sd(q,ideal)>0 && Math.min(...ideal.map(vv=>P2.len(P2.sub(q,vv))))>(globalThis.VR??2.5)*t){ zone++; let cov=false; for(let fb=0;fb<S.faces.length&&!cov;fb++){const[q2,d2]=fr[fb].to2(X); if(d2>-eps&&d2<t+eps&&sd(q2,at(Math.max(0,Math.min(t,d2))))>-eps)cov=true;} if(!cov)voids++; }
  }
  return{coll,protr:+protr.toFixed(3),voidPct:+(100*voids/zone).toFixed(2),N:g.N};
}
if(!globalThis.SKIP)for(const id of['tetra','octa','dodeca','icosa'])for(const st of['flush','bevel'])console.log(id.padEnd(7),st.padEnd(6),JSON.stringify(run(id,80,3,st)));
if(!globalThis.SKIP)console.log('icosa 6.35', JSON.stringify(run('icosa',120,6.35,'bevel')));
