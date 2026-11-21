import { useEffect, useRef, useState } from 'react'

type Pt = { id: number; x: number; y: number; label: string; group: string; kind: 'K' | 'M' }
type Segment = { a: Pt; b: Pt; group: string; number: number }
const numberText = (n: number) => Math.round(n).toLocaleString('lt-LT')
const unique = (pts: Pt[]) => [...new Set(pts.map(p => p.group))]
function linesFor(pts: Pt[]): Segment[] {
  let n = 0
  const out: Segment[] = []
  for (const group of unique(pts)) {
    const groupPts = pts.filter(p => p.group === group)
    const motors = groupPts.filter(p => p.kind === 'M')
    const refs = groupPts.filter(p => p.kind === 'K')
    if (motors.length && refs.length) {
      const m = motors[0]
      const k = refs.reduce((a, b) => Math.hypot(a.x-m.x,a.y-m.y) <= Math.hypot(b.x-m.x,b.y-m.y) ? a : b)
      out.push({a:k,b:m,group,number:++n})
    }
    for (let i=1; i<motors.length; i++) out.push({a:motors[i-1],b:motors[i],group,number:++n})
  }
  return out
}
export default function RiggingMeasurements() {
  const ref = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [points,setPoints] = useState<Pt[]>([])
  const [group,setGroup] = useState('Ekranas 1')
  const [kind,setKind] = useState<'K'|'M'>('M')
  const [mode,setMode] = useState<'point'|'scale'>('point')
  const [cal,setCal] = useState<{x:number;y:number}[]>([])
  const [scaleMeters,setScaleMeters] = useState('5')
  const [meterPerPixel,setMeterPerPixel] = useState<number | null>(null)
  const [view,setView] = useState({width:1200,height:800})
  const [title,setTitle] = useState('LED rigging montavimo planas')
  const [selectedGroup,setSelectedGroup] = useState('__all')
  const [status,setStatus] = useState('Įkelkite Top/Plan PNG arba JPG.')
  const [fileName,setFileName] = useState('')
  const sourceRef = useRef<HTMLInputElement>(null)
  const lines = linesFor(points)
  const scale = meterPerPixel
  useEffect(() => {
    if (cal.length === 2) {
      const d = Math.hypot(cal[1].x-cal[0].x,cal[1].y-cal[0].y)
      const m = Number(scaleMeters)
      if (d>0 && m>0) setMeterPerPixel(m/d)
      else setMeterPerPixel(null)
    }
  },[cal,scaleMeters])
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const c = canvas.getContext('2d')
    if (!c) return
    canvas.width=view.width;canvas.height=view.height
    c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height)
    if(imgRef.current) c.drawImage(imgRef.current,0,0,view.width,view.height)
    for(const p of points) {
      c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fillStyle=p.kind==='K'?'#d97706':'#155eac';c.fill()
      c.fillStyle='#111827';c.font='12px sans-serif';c.fillText(p.label,p.x+7,p.y-6)
    }
    for(const p of cal){c.fillStyle='#16a34a';c.fillRect(p.x-4,p.y-4,8,8)}
  },[points,cal,view])
  function loadImage(file: File) {
    if (!file.type.startsWith('image/')) { setStatus('Šioje integracijos versijoje įkelkite PNG/JPG. PDF arba DXF reikia paruošti kaip Top/Plan vaizdą.');return }
    const url=URL.createObjectURL(file), im=new Image()
    im.onload=()=>{imgRef.current=im;setView({width:im.naturalWidth,height:im.naturalHeight});setPoints([]);setCal([]);setMeterPerPixel(null);setFileName(file.name);setStatus('Brėžinys įkeltas. Kalibruokite mastelį.');URL.revokeObjectURL(url)}
    im.onerror=()=>{setStatus('Nepavyko perskaityti paveikslo');URL.revokeObjectURL(url)}
    im.src=url
  }
  function click(e: React.MouseEvent<HTMLCanvasElement>) {
    const box=e.currentTarget.getBoundingClientRect()
    const x=(e.clientX-box.left)*view.width/box.width,y=(e.clientY-box.top)*view.height/box.height
    if(mode==='scale'){setCal(old=>old.length===2?[{x,y}]:[...old,{x,y}]);return}
    const peers=points.filter(p=>p.group===group&&p.kind===kind)
    const label=(kind==='K'?'K':'M')+(peers.length+1)
    setPoints(old=>[...old,{id:Date.now()+Math.random(),x,y,label,kind,group}])
  }
  function saveJson() {
    const data={schema:1,source:fileName,width:view.width,height:view.height,points,calibrationPoints:cal,metersPerUnit:scale}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
    download(blob,'rigging-projektas.json')
  }
  function loadJson(file: File) {
    file.text().then(s=>{const d=JSON.parse(s);if(!Array.isArray(d.points))throw Error('Neteisingas JSON');setPoints(d.points);setCal(d.calibrationPoints||[]);setMeterPerPixel(d.metersPerUnit||null);setStatus('Taškai įkelti. Patikrinkite, ar brėžinio vaizdas atitinka projektą.')}).catch(()=>setStatus('Nepavyko įkelti projekto JSON'))
  }
  function download(blob: Blob, name: string) { const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000) }
  function exportPNG() {
    if(!scale || scale<=0){setStatus('Prieš eksportą nustatykite mastelį.');return}
    const relevant=selectedGroup==='__all'?points:points.filter(p=>p.group===selectedGroup)
    if(!relevant.some(p=>p.kind==='M')){setStatus('Pažymėkite bent vieną motorą.');return}
    const seg=linesFor(relevant)
    const W=3508,H=2480,can=document.createElement('canvas');can.width=W;can.height=H
    const c=can.getContext('2d')!
    const red='#d52b1e',dark='#172536'
    c.fillStyle='#fff';c.fillRect(0,0,W,H)
    c.fillStyle=dark;c.fillRect(0,0,W,155)
    c.fillStyle='#fff';c.font='bold 48px Arial';c.fillText(title.slice(0,64),86,74)
    c.fillStyle='#9ce4d9';c.font='bold 28px Arial';c.fillText(selectedGroup==='__all'?'VISI EKRANAI':selectedGroup,88,124)
    const bX=75,bY=210,bW=2330,bH=1990
    c.strokeStyle='#c9d1d8';c.lineWidth=2;c.strokeRect(bX,bY,bW,bH)
    let minX=Math.min(...relevant.map(p=>p.x)),maxX=Math.max(...relevant.map(p=>p.x))
    let minY=Math.min(...relevant.map(p=>p.y)),maxY=Math.max(...relevant.map(p=>p.y))
    if (selectedGroup==='__all') {minX=0;minY=0;maxX=view.width;maxY=view.height}
    const padX=Math.max(60,(maxX-minX)*.13),padY=Math.max(60,(maxY-minY)*.13)
    minX-=padX;maxX+=padX;minY-=padY;maxY+=padY
    const factor=Math.min((bW-80)/(maxX-minX),(bH-80)/(maxY-minY))
    const offsetX=bX+(bW-(maxX-minX)*factor)/2-minX*factor
    const offsetY=bY+(bH-(maxY-minY)*factor)/2-minY*factor
    const pos=(p:{x:number;y:number})=>({x:offsetX+p.x*factor,y:offsetY+p.y*factor})
    c.save();c.beginPath();c.rect(bX,bY,bW,bH);c.clip()
    if(imgRef.current){c.globalAlpha=.57;c.drawImage(imgRef.current,offsetX,offsetY,view.width*factor,view.height*factor);c.globalAlpha=1}
    seg.forEach((s,i)=>{
      const a=pos(s.a),b=pos(s.b),dx=b.x-a.x,dy=b.y-a.y
      const len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len
      // Dimension chain offset from the measured endpoints.
      const offset=(i%3+1)*35
      const ax=a.x+nx*offset,ay=a.y+ny*offset,bx=b.x+nx*offset,by=b.y+ny*offset
      c.strokeStyle=red;c.lineWidth=1.6
      const line=(x1:number,y1:number,x2:number,y2:number)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
      line(a.x,a.y,ax+nx*13,ay+ny*13);line(b.x,b.y,bx+nx*13,by+ny*13);line(ax,ay,bx,by)
      for(const p of [{x:ax,y:ay},{x:bx,y:by}])line(p.x-7,p.y+7,p.x+7,p.y-7)
      const dist=Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)*scale*1000
      const midX=(ax+bx)/2,midY=(ay+by)/2
      const angle=Math.atan2(by-ay,bx-ax)
      c.save();c.translate(midX,midY);c.rotate(Math.abs(angle)>Math.PI/2?angle+Math.PI:angle)
      const text=String(s.number)+' · '+numberText(dist)
      c.font='bold 17px Arial';const textW=c.measureText(text).width
      c.fillStyle='rgba(255,255,255,.91)';c.fillRect(-textW/2-6,-24,textW+12,30)
      c.fillStyle=red;c.textAlign='center';c.fillText(text,0,-6);c.restore()
    })
    for(const p of relevant){
      const q=pos(p);c.fillStyle=p.kind==='K'?'#d97706':'#1767b0';c.beginPath();c.arc(q.x,q.y,7,0,Math.PI*2);c.fill()
      c.font='bold 15px Arial';c.fillStyle=dark;c.textAlign='left';c.fillText(p.label,q.x+11,q.y-10)
    }
    c.restore()
    const X=2440
    c.fillStyle='#eff3f6';c.fillRect(X,210,990,65);c.fillStyle=dark;c.font='bold 31px Arial';c.fillText('MONTAVIMO MATMENYS (mm)',X+18,254)
    let row=320
    c.font='bold 23px Arial';c.fillText('Nr.',X+15,row);c.fillText('NUO → IKI',X+110,row);c.fillText('ATSTUMAS',X+690,row)
    row+=20
    for(const s of seg){
      if(row>2050)break
      c.fillStyle=row%2?'#f8fafc':'#eff3f8';c.fillRect(X,row,990,47)
      c.fillStyle=dark;c.font='20px Arial';c.fillText(String(s.number),X+15,row+31);c.fillText(s.group+'  '+s.a.label+' → '+s.b.label,X+110,row+31)
      c.font='bold 22px Arial';c.fillText(numberText(Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)*scale*1000),X+690,row+31)
      row+=49
    }
    c.fillStyle=dark;c.font='22px Arial';c.fillText('Kryžmės: '+relevant.filter(p=>p.kind==='K').length+'  •  Motorai: '+relevant.filter(p=>p.kind==='M').length,X+16,2180)
    c.fillStyle='#a33a20';c.font='20px Arial';c.fillText('Visi matmenys milimetrais. Vaizdas iš viršaus.',86,2300)
    c.fillText('Patikrinti mastelį ir atskaitos taškų pozicijas prieš montavimą.',86,2350)
    can.toBlob(b=>b&&download(b,'Rigging_'+(selectedGroup==='__all'?'visi':selectedGroup.replace(/[^\w-]/g,'_'))+'.png'),'image/png')
    setStatus('PNG montavimo lapas paruoštas (3508 × 2480 px).')
  }
  return <div className="space-y-4 text-zinc-900">
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h2 className="text-xl font-bold">Pakabinimo taškų matavimai</h2>
      <p className="mt-1 text-sm text-zinc-600">Top/Plan brėžinys → kryžmės ir motorai → montavimo matmenys (mm) → PNG.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">Brėžinys PNG/JPG<input ref={sourceRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)loadImage(f)}} className="block w-full"/></label>
        <label className="text-sm">Projekto pavadinimas<input className="w-full rounded border p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="text-sm">Ekrano pavadinimas<input className="w-full rounded border p-2" value={group} onChange={e=>setGroup(e.target.value)}/></label>
        <label className="text-sm">Mastelio atstumas (m)<input type="number" min=".0001" step=".01" className="w-full rounded border p-2" value={scaleMeters} onChange={e=>setScaleMeters(e.target.value)}/></label>
        <label className="text-sm">Žymimas taškas<select className="w-full rounded border p-2" value={kind} onChange={e=>setKind(e.target.value as 'K'|'M')}><option value="K">Kryžmė</option><option value="M">Motoras</option></select></label>
        <label className="text-sm">Eksportuojamas ekranas<select className="w-full rounded border p-2" value={selectedGroup} onChange={e=>setSelectedGroup(e.target.value)}><option value="__all">Visi ekranai</option>{unique(points).map(g=><option key={g} value={g}>{g}</option>)}</select></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={'rounded px-4 py-2 '+(mode==='scale'?'bg-teal-700 text-white':'bg-zinc-100')} onClick={()=>{setMode('scale');setCal([])}}>1. Mastelis: 2 taškai</button>
        <button className={'rounded px-4 py-2 '+(mode==='point'?'bg-teal-700 text-white':'bg-zinc-100')} onClick={()=>setMode('point')}>2. Žymėti taškus</button>
        <button className="rounded bg-zinc-100 px-4 py-2" onClick={()=>setPoints(x=>x.slice(0,-1))}>Atšaukti tašką</button>
        <button className="rounded bg-zinc-100 px-4 py-2" onClick={saveJson}>Išsaugoti JSON</button>
        <label className="cursor-pointer rounded bg-zinc-100 px-4 py-2">Atidaryti JSON<input type="file" accept=".json" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)loadJson(f)}}/></label>
        <button className="rounded bg-teal-700 px-4 py-2 font-semibold text-white" onClick={exportPNG}>Eksportuoti PNG (A4)</button>
      </div>
      <p role="status" className="mt-3 text-sm text-zinc-600">{status} {scale?' Mastelis nustatytas.':' Mastelis nenustatytas.'}</p>
      <p className="text-xs text-amber-800">Brėžinys matuojamas 2D; tai ne konstrukcijų laikomosios galios arba rigingo saugos patikra.</p>
    </div>
    <div className="overflow-auto rounded-2xl border bg-white p-3"><canvas ref={ref} onClick={click} style={{width:'100%',height:'auto',cursor:'crosshair'}}/></div>
    <div className="overflow-x-auto rounded-2xl border bg-white p-3"><h3 className="mb-2 font-semibold">Atstumai tarp taškų</h3>
      <table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Nr.</th><th className="p-2 text-left">Ekranas</th><th className="p-2 text-left">Nuo → iki</th><th className="p-2 text-right">Atstumas (mm)</th><th className="p-2 text-right">ΔX (mm)</th><th className="p-2 text-right">ΔY (mm)</th></tr></thead><tbody>{lines.map(s=><tr key={s.number} className="border-t"><td className="p-2">{s.number}</td><td className="p-2">{s.group}</td><td className="p-2">{s.a.label} → {s.b.label}</td><td className="p-2 text-right">{scale?numberText(Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)*scale*1000):'—'}</td><td className="p-2 text-right">{scale?numberText((s.b.x-s.a.x)*scale*1000):'—'}</td><td className="p-2 text-right">{scale?numberText((s.a.y-s.b.y)*scale*1000):'—'}</td></tr>)}</tbody></table>
    </div>
  </div>
}
