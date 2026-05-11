import { useState, useMemo, useEffect, createContext, useContext } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt  = n => new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(n||0);
const fmtS = n => {
  if(!n&&n!==0) return "$0";
  const a=Math.abs(n),s=n<0?"-":"";
  if(a>=1e6) return `${s}$${(a/1e6).toFixed(2)}M`;
  if(a>=1e3) return `${s}$${(a/1e3).toFixed(0)}K`;
  return `${s}$${Math.round(a)}`;
};

const gaFV=(p,r,g,n)=>{
  if(n<=0)return 0;
  if(Math.abs(r-g)<1e-9)return p*n*Math.pow(1+r,Math.max(n-1,0));
  return p*(Math.pow(1+r,n)-Math.pow(1+g,n))/(r-g);
};
const gaSum=(p,g,n)=>{
  if(n<=0)return 0;
  if(Math.abs(g)<1e-9)return p*n;
  return p*((Math.pow(1+g,n)-1)/g);
};

// ─── constants ───────────────────────────────────────────────────────────────
const PROVINCES=["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
const STABS=["1. About You","2. Income & Savings","3. Assets & Debts","4. Assumptions","Learn"];
const DTABS=["Overview","Contributions","Retirement"];
const DEF={
  age:30,retAge:55,province:"ON",life:90,
  takeHome:0,incGrowth:2,expenses:0,
  homeVal:0,homeApp:4,
  tfsa:0,rrsp:0,nonReg:0,cash:0,
  mTFSA:0,mRRSP:0,mOther:0,mMatch:0,
  kids:0,kidAge:5,respBal:0,mRESP:0,
  mortBal:0,mortRate:5,mMort:0,otherDebt:0,mOtherDebt:0,
  ret:7,inf:3,swr:4,
};
const GUIDE=[
  {title:"🔥 FIRE Basics",items:[
    {t:"FIRE",d:"Financial Independence, Retire Early. Build enough invested assets so your portfolio generates enough passive income to cover living expenses — work becomes optional, not mandatory."},
    {t:"FIRE Number",d:"The total portfolio you need to retire. Formula: Annual expenses ÷ Safe Withdrawal Rate. At 4% SWR you need 25× your annual spending. Example: $60,000/yr ÷ 0.04 = $1,500,000."},
    {t:"Safe Withdrawal Rate (SWR)",d:"The % of your portfolio you withdraw each year in retirement. The '4% rule' found that a 4% annual withdrawal from a diversified portfolio has historically never run out over 30 years."},
  ]},
  {title:"🏦 Canadian Accounts",items:[
    {t:"TFSA",d:"Tax-Free Savings Account. ALL growth and withdrawals are 100% tax-free. 2024 limit: $7,000/year. Cumulative room since 2009: $95,000. Max this before non-registered investing."},
    {t:"RRSP",d:"Registered Retirement Savings Plan. Contributions reduce taxable income today, but withdrawals are taxed in retirement. Best when you contribute at high tax rates and withdraw at lower ones."},
    {t:"RESP",d:"Registered Education Savings Plan. Grows tax-free. Withdrawals taxed in the child's hands — usually $0 tax as a student. Lifetime limit: $50,000 per child."},
    {t:"CESG",d:"Canada Education Savings Grant — free government money. 20% on first $2,500/child/year = $500/year free, up to $7,200 lifetime. Contribute $209/month per child to maximize it."},
  ]},
  {title:"🇨🇦 Government Benefits",items:[
    {t:"CPP",d:"Canada Pension Plan — earned by working. Max 2024: ~$16,375/year. Available from age 60 (reduced) to 70 (increased). Calculator estimates ~70% of max based on years worked."},
    {t:"OAS",d:"Old Age Security — flat benefit paid at age 65 regardless of work history. ~$8,784/year. Retiring before 65 means $0 until you turn 65 — raises your FIRE number significantly."},
  ]},
  {title:"📊 Calculator Terms",items:[
    {t:"Ideal Portfolio Today",d:"How much you need invested RIGHT NOW — given future contributions — to hit your FIRE number at retirement. Formula: (FIRE Number − FV of contributions) ÷ (1+return)^years."},
    {t:"Gap",d:"Difference between ideal portfolio today vs what you actually have. Positive = behind. Negative (green) = ahead of the ideal path."},
    {t:"Savings Rate",d:"% of after-tax income going into investments. 20%+ is strong. 50%+ is FIRE territory. The single most powerful lever you control."},
    {t:"Portfolio Lasts Until Age",d:"How long your retirement portfolio lasts. If portfolio earns more than you withdraw (return > SWR), it never depletes — shown as 90+."},
    {t:"Mortgage Payoff Effect",d:"Mortgage paid off before retirement means that payment disappears from your expense base, directly lowering your FIRE number. A $3,600/month payoff can reduce your FIRE number by $1M+."},
  ]},
];

// ─── Context — the real fix. F/SL read inp/setInp from context, not props. ──
// This means they can be used as plain <F .../> without any wrapper, so React
// sees the same stable component identity on every render → no remount → no focus loss.
const FormCtx = createContext(null);

function F({ label, k, opts={} }) {
  const { inp, setInp } = useContext(FormCtx);
  const [raw, setRaw] = useState(inp[k] === 0 ? "" : String(inp[k]));
  const [focused, setFocused] = useState(false);

  // Keep raw in sync with inp[k] whenever the field is not being actively edited.
  // This is what makes values survive tab switches, sidebar close/reopen, etc.
  useEffect(() => {
    if (!focused) {
      setRaw(inp[k] === 0 ? "" : String(inp[k]));
    }
  }, [inp[k], focused]);

  const onChange = e => {
    const str = e.target.value;
    setRaw(str);
    const n = parseFloat(str);
    if (!isNaN(n)) setInp(p => ({ ...p, [k]: n }));
    else if (str === "" || str === "-") setInp(p => ({ ...p, [k]: 0 }));
  };
  const onFocus = () => setFocused(true);
  const onBlur  = () => {
    setFocused(false);
    setRaw(inp[k] === 0 ? "" : String(inp[k]));
  };

  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:12,fontWeight:600,color:"#6b7280",
        textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>{label}</label>
      <div style={{display:"flex",alignItems:"center",background:"#f9fafb",
        border:"1px solid #e5e7eb",borderRadius:8,overflow:"hidden"}}>
        {opts.pre && <span style={{padding:"11px 13px",color:"#9ca3af",fontSize:14,
          background:"#f3f4f6",borderRight:"1px solid #e5e7eb"}}>{opts.pre}</span>}
        <input
          type="text" inputMode="decimal"
          value={raw}
          onChange={onChange} onFocus={onFocus} onBlur={onBlur}
          style={{flex:1,padding:"11px 13px",border:"none",background:"transparent",
            outline:"none",fontSize:15,color:"#111827"}}
        />
        {opts.suf && <span style={{padding:"11px 13px",color:"#9ca3af",fontSize:14,
          background:"#f3f4f6",borderLeft:"1px solid #e5e7eb"}}>{opts.suf}</span>}
      </div>
      {opts.hint && <p style={{fontSize:11,color:"#9ca3af",marginTop:5,marginBottom:0,lineHeight:1.4}}>{opts.hint}</p>}
    </div>
  );
}

function SL({ label, k, min, max, step=0.5, suf="", hint="" }) {
  const { inp, setInp } = useContext(FormCtx);
  const [raw, setRaw] = useState(String(inp[k]));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(inp[k]));
  }, [inp[k], focused]);

  const onText = e => {
    const str = e.target.value;
    setRaw(str);
    const v = parseFloat(str);
    if (!isNaN(v) && v >= min && v <= max) setInp(p => ({ ...p, [k]: v }));
  };
  const onTextBlur = () => { setFocused(false); setRaw(String(inp[k])); };
  const onSlider   = e => {
    const v = Number(e.target.value);
    setInp(p => ({ ...p, [k]: v }));
    setRaw(String(v));
  };

  return (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:14,color:"#374151",fontWeight:500}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <input
            type="text" inputMode="decimal" value={raw}
            onChange={onText} onFocus={()=>setFocused(true)} onBlur={onTextBlur}
            style={{width:56,padding:"4px 8px",border:"1px solid #e5e7eb",borderRadius:6,
              fontSize:14,fontWeight:700,color:"#1d4ed8",textAlign:"right",
              outline:"none",background:"#f0f6ff"}}
          />
          <span style={{fontSize:13,color:"#1d4ed8",fontWeight:700}}>{suf}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={inp[k]}
        onChange={onSlider}
        style={{width:"100%",accentColor:"#1d4ed8",height:6,cursor:"pointer"}}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:2,marginBottom:hint?4:0}}>
        <span style={{fontSize:10,color:"#9ca3af"}}>{min}{suf}</span>
        <span style={{fontSize:10,color:"#9ca3af"}}>{max}{suf}</span>
      </div>
      {hint && <p style={{fontSize:10,color:"#9ca3af",margin:0,lineHeight:1.4}}>{hint}</p>}
    </div>
  );
}

// ─── small purely-presentational pieces (no hooks, safe inside App) ──────────
const sec = t => (
  <p style={{fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",
    letterSpacing:"0.07em",margin:"18px 0 10px",borderBottom:"1px solid #f3f4f6",paddingBottom:6}}>{t}</p>
);

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [inp, setInp] = useState(DEF);
  const [st,  setSt]  = useState(0);
  const [dt,  setDt]  = useState(0);
  const [show,setShow] = useState(false);
  const [tip, setTip]  = useState(null);

  const ctxVal = useMemo(() => ({ inp, setInp }), [inp]);

  const setS = k => e => setInp(p => ({ ...p, [k]: e.target.value }));

  // ── calculations ──────────────────────────────────────────────────────────
  const c = useMemo(() => {
    const r=inp.ret/100, infR=inp.inf/100, swrR=inp.swr/100, g=inp.incGrowth/100;
    const n=Math.max(inp.retAge-inp.age,1);
    const projHome=inp.homeVal*Math.pow(1+inp.homeApp/100,n);
    const homeAtYr=yr=>inp.homeVal*Math.pow(1+inp.homeApp/100,Math.min(yr,n));
    const debtPmt=inp.mMort+inp.mOtherDebt;
    const retBase=Math.max(inp.expenses-debtPmt,0);
    const mre=retBase*Math.pow(1+infR,n);
    const annRet=mre*12;
    const yw=Math.min(Math.max(inp.retAge-22,0),39);
    const cpp=inp.retAge>=60?(yw/39)*0.70*16375:0;
    const oas=inp.retAge>=65?8784:0;
    const portNeed=Math.max(annRet-cpp-oas,annRet*0.25);
    const fireNum=swrR>0?portNeed/swrR:portNeed*100;
    const nw=inp.tfsa+inp.rrsp+inp.nonReg+inp.cash;
    const ann=(inp.mTFSA+inp.mRRSP+inp.mOther+inp.mMatch)*12;
    const fvF=Math.pow(1+r,n);
    const cFV=gaFV(ann,r,g,n);
    const projNW=nw*fvF+cFV;
    const rawIdeal=(fireNum-cFV)/fvF;
    const cAlone=rawIdeal<=0;
    const ideal=Math.max(0,rawIdeal);
    const gap=cAlone?-nw:ideal-nw;
    const gapPct=cAlone?-(nw/fireNum)*100:ideal>0?(gap/ideal)*100:0;
    let status,sc,sbg,sb;
    if(gapPct<=-10){status="Ahead";sc="#059669";sbg="#ecfdf5";sb="#6ee7b7";}
    else if(gapPct<=5){status="On Track";sc="#1d4ed8";sbg="#eff6ff";sb="#93c5fd";}
    else if(gapPct<=20){status="Slightly Behind";sc="#d97706";sbg="#fffbeb";sb="#fcd34d";}
    else{status="Behind";sc="#dc2626";sbg="#fef2f2";sb="#fca5a5";}
    const savR=(inp.takeHome*12)>0?(ann/(inp.takeHome*12))*100:0;
    let fireAge=inp.retAge;
    for(let y=1;y<=55;y++){
      if(nw*Math.pow(1+r,y)+gaFV(ann,r,g,y)>=fireNum){fireAge=inp.age+y;break;}
      if(y===55)fireAge=inp.age+55;
    }
    let extra=0;
    if(projNW<fireNum){
      const f=Math.abs(r-g)<1e-9?n*Math.pow(1+r,Math.max(n-1,0)):(fvF-Math.pow(1+g,n))/(r-g);
      if(f>0) extra=Math.max(0,(fireNum-projNW)/f/12);
    }
    let delay=0;
    if(projNW<fireNum){
      for(let d=1;d<=20;d++){
        const nD=n+d,pD=nw*Math.pow(1+r,nD)+gaFV(ann,r,g,nD);
        const mD=retBase*Math.pow(1+infR,nD);
        const cD=(inp.retAge+d)>=60?(Math.min(Math.max(inp.retAge+d-22,0),39)/39)*0.70*16375:0;
        const oD=(inp.retAge+d)>=65?8784:0;
        const fD=Math.max(mD*12-cD-oD,mD*12*0.25)/swrR;
        if(pD>=fD){delay=d;break;}
        if(d===20)delay=20;
      }
    }
    const spendCut=projNW<fireNum&&portNeed>0?Math.max(0,(1-(projNW*swrR)/portNeed)*100):0;
    const y18=Math.max(0,18-inp.kidAge);
    const annR=inp.mRESP*12;
    const cesgPer=Math.min(annR,2500)*0.20;
    const totCESG=cesgPer*inp.kids;
    const lifeCESG=Math.min(cesgPer*y18,7200)*inp.kids;
    const projRESP=y18>0?(r>0?inp.respBal*Math.pow(1+r,y18)+(annR+totCESG)*(Math.pow(1+r,y18)-1)/r:inp.respBal+(annR+totCESG)*y18):inp.respBal;
    const optRESP=Math.ceil((2500*inp.kids)/12);
    const maxCESG=annR>=2500*inp.kids;
    const futPrin=gaSum(ann,g,n);
    const totPrin=nw+futPrin;
    const gains=projNW-totPrin;
    const mult=totPrin>0?projNW/totPrin:0;
    const contData=[];
    for(let age=inp.age;age<=inp.retAge;age++){
      const yr=age-inp.age;
      contData.push({age,principal:Math.round(nw+gaSum(ann,g,yr)),portfolio:Math.round(Math.max(nw*Math.pow(1+r,yr)+gaFV(ann,r,g,yr),0))});
    }
    const mPort=(projNW*swrR)/12, mCPP=cpp/12, mOAS=oas/12;
    const totInc=mPort+mCPP+mOAS;
    const surplus=totInc-mre;
    const portSurplus=projNW-fireNum;
    const annEarn=projNW*r;
    const portLasts=projNW>0&&portNeed>0?(r<=0?projNW/portNeed:annEarn>=portNeed?999:-Math.log(1-annEarn/portNeed)/Math.log(1+r)):0;
    const maxAge=Math.min(inp.life,Math.max(inp.retAge+20,inp.age+35));
    const chart=[];
    for(let age=inp.age;age<=maxAge;age++){
      const yr=age-inp.age;
      let pnw,pideal;
      if(yr<=n){pnw=nw*Math.pow(1+r,yr)+gaFV(ann,r,g,yr);pideal=ideal*Math.pow(1+r,yr)+gaFV(ann,r,g,yr);}
      else{const py=yr-n;pnw=r>0?projNW*Math.pow(1+r,py)-portNeed*(Math.pow(1+r,py)-1)/r:projNW-portNeed*py;pnw=Math.max(0,pnw);pideal=null;}
      chart.push({age,nw:Math.round(Math.max(0,pnw||0)),ideal:pideal!=null?Math.round(Math.max(0,pideal)):null,fire:Math.round(fireNum),home:Math.round(homeAtYr(yr))});
    }
    return{fireNum,nw,projNW,ideal,gap,gapPct,cAlone,status,sc,sbg,sb,savR,fireAge,n,cpp,oas,portNeed,mre,extra,delay,spendCut,ann,cFV,g,projHome,debtPmt,mPort,mCPP,mOAS,totInc,surplus,portSurplus,portLasts,projRESP,totCESG,lifeCESG,y18,maxCESG,optRESP,futPrin,totPrin,gains,mult,contData,chart};
  }, [inp]);

  // ── tooltip ───────────────────────────────────────────────────────────────
  const TTip = ({ active, payload, label }) => {
    if(!active||!payload?.length) return null;
    return (
      <div style={{background:"#1e293b",borderRadius:8,padding:"10px 14px",boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
        <p style={{fontWeight:700,margin:"0 0 6px",fontSize:12,color:"#fff"}}>Age {label}</p>
        {payload.map(p=>(
          <div key={p.name} style={{display:"flex",justifyContent:"space-between",gap:16,marginBottom:2}}>
            <span style={{fontSize:11,color:"#94a3b8"}}>{p.name}</span>
            <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{fmtS(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const TIPS = {
    ideal:"How much you'd need invested RIGHT NOW — given your future contributions — to hit your FIRE number at retirement.",
    gap:"Positive (red) = behind ideal path. Negative (green) = ahead.",
  };
  const Tip = ({ id }) => (
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",marginLeft:5}}>
      <button onMouseEnter={()=>setTip(id)} onMouseLeave={()=>setTip(null)}
        style={{width:14,height:14,borderRadius:"50%",border:"none",background:"#e5e7eb",
          color:"#6b7280",fontSize:9,fontWeight:700,cursor:"pointer",
          display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>i</button>
      {tip===id&&<div style={{position:"absolute",bottom:"calc(100% + 8px)",left:0,width:220,
        background:"#1e293b",color:"#f1f5f9",fontSize:11,lineHeight:1.6,padding:"10px 12px",
        borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,.3)",zIndex:9999,pointerEvents:"none"}}>{TIPS[id]}</div>}
    </span>
  );

  const progPct = Math.min((c.nw/c.fireNum)*100, 100);
  const ahead   = c.projNW >= c.fireNum;

  // ── sidebar ───────────────────────────────────────────────────────────────
  const sidebar = () => {
    if(st===0) return <>
      {sec("Personal Info")}
      <F label="Current Age"            k="age"    opts={{suf:"yrs"}}/>
      <F label="Target Retirement Age"  k="retAge" opts={{suf:"yrs"}}/>
      <F label="Life Expectancy"        k="life"   opts={{suf:"yrs"}}/>
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:12,fontWeight:600,color:"#6b7280",
          textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Province</label>
        <select value={inp.province} onChange={setS("province")}
          style={{width:"100%",padding:"11px 13px",background:"#f9fafb",border:"1px solid #e5e7eb",
            borderRadius:8,fontSize:14,color:"#111827",outline:"none"}}>
          {PROVINCES.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>
      <button onClick={()=>setSt(1)} style={{width:"100%",marginTop:20,padding:"13px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Next → {STABS[1]}</button>
    </>;

    if(st===1) return <>
      {sec("Income")}
      <F label="Monthly Take-Home Pay"     k="takeHome"  opts={{pre:"$",hint:"Your actual after-tax income — what hits your bank account each month"}}/>
      <F label="Annual Income Growth Rate" k="incGrowth" opts={{suf:"%",hint:`Contributions grow at this rate yearly → FV: ${fmtS(c.cFV)}`}}/>
      {sec("Expenses")}
      <F label="Total Monthly Expenses" k="expenses" opts={{pre:"$",hint:"Include mortgage + all lifestyle costs"}}/>
      <div style={{padding:"12px 14px",background:"#f0f9ff",borderRadius:8,border:"1px solid #bae6fd",marginBottom:12}}>
        <p style={{fontSize:10,fontWeight:700,color:"#0369a1",textTransform:"uppercase",margin:"0 0 8px"}}>Retirement Monthly Expenses</p>
        {[["Today's expenses",fmt(inp.expenses),"#374151"],["− Mortgage paid off","− "+fmt(c.debtPmt),"#059669"],["× inflation factor","× "+Math.pow(1+inp.inf/100,c.n).toFixed(2),"#6b7280"]].map(([l,v,cl])=>
          <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,color:cl}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:cl}}>{v}</span>
          </div>
        )}
        <div style={{borderTop:"1px solid #bae6fd",paddingTop:8,display:"flex",justifyContent:"space-between",marginTop:4}}>
          <span style={{fontSize:13,fontWeight:700,color:"#0369a1"}}>At retirement</span>
          <span style={{fontSize:15,fontWeight:800,color:"#1d4ed8"}}>{fmt(c.mre)}/mo</span>
        </div>
      </div>
      {sec("Monthly FIRE Contributions")}
      <F label="Monthly TFSA"             k="mTFSA"  opts={{pre:"$"}}/>
      <F label="Monthly RRSP"             k="mRRSP"  opts={{pre:"$"}}/>
      <F label="Monthly Other Investments"k="mOther" opts={{pre:"$"}}/>
      <F label="Employer Match (monthly)" k="mMatch" opts={{pre:"$"}}/>
      {sec("RESP — Education Savings")}
      <F label="Number of Children"         k="kids"/>
      <F label="Youngest Child's Age"       k="kidAge"  opts={{suf:"yrs"}}/>
      <F label="Monthly RESP Contribution"  k="mRESP"   opts={{pre:"$",hint:`$${c.optRESP}/mo maximizes the $500/yr CESG grant`}}/>
      {inp.kids>0&&<div style={{padding:"10px 12px",background:c.maxCESG?"#ecfdf5":"#fffbeb",borderRadius:8,
        border:`1px solid ${c.maxCESG?"#6ee7b7":"#fcd34d"}`,marginBottom:10}}>
        <p style={{fontSize:11,fontWeight:600,color:c.maxCESG?"#065f46":"#92400e",margin:0}}>
          {c.maxCESG?"✓ CESG maximized — $500/yr per child":`Contribute $${c.optRESP}/mo to unlock full CESG`}
        </p>
      </div>}
      <button onClick={()=>setSt(2)} style={{width:"100%",marginTop:20,padding:"13px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Next → {STABS[2]}</button>
    </>;

    if(st===2) return <>
      {sec("Home")}
      <F label="Current Home Value" k="homeVal" opts={{pre:"$",hint:`Projected at age ${inp.retAge}: ${fmtS(c.projHome)} (mortgage-free)`}}/>
      <div style={{padding:"10px 12px",background:"#fafaf9",borderRadius:8,border:"1px solid #e7e5e4",marginBottom:12}}>
        <p style={{fontSize:11,color:"#6b7280",margin:0}}>Staying in home — equity not in FIRE portfolio. Mortgage payoff saves {fmt(c.debtPmt)}/mo in retirement.</p>
      </div>
      {sec("Investment Accounts")}
      <F label="TFSA Balance"               k="tfsa"   opts={{pre:"$"}}/>
      <F label="RRSP Balance"               k="rrsp"   opts={{pre:"$"}}/>
      <F label="Non-Registered Investments" k="nonReg" opts={{pre:"$"}}/>
      <F label="Cash Savings"               k="cash"   opts={{pre:"$"}}/>
      {sec("RESP Balance")}
      <F label="Current RESP Balance" k="respBal" opts={{pre:"$"}}/>
      {sec("Liabilities")}
      <F label="Mortgage Balance"             k="mortBal"    opts={{pre:"$"}}/>
      <F label="Mortgage Rate"                k="mortRate"   opts={{suf:"%"}}/>
      <F label="Monthly Mortgage Payment"     k="mMort"      opts={{pre:"$",hint:"Subtracted from retirement expense base"}}/>
      <F label="Other Debt Balance"           k="otherDebt"  opts={{pre:"$"}}/>
      <F label="Other Monthly Debt Payments"  k="mOtherDebt" opts={{pre:"$"}}/>
      <button onClick={()=>setSt(3)} style={{width:"100%",marginTop:20,padding:"13px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>Next → {STABS[3]}</button>
    </>;

    if(st===3) return <>
      {sec("Model Assumptions")}
      <SL label="Expected Annual Return"  k="ret"     min={0}  max={15} step={0.5}  suf="%" hint="Historical diversified index: 7–10%. Use 6–7% for conservative planning."/>
      <SL label="Inflation Rate"          k="inf"     min={0}  max={8}  step={0.5}  suf="%" hint="At 3%, $100 today costs $134 in 10 years. Applied to retirement expenses automatically."/>
      <SL label="Safe Withdrawal Rate"    k="swr"     min={0.25}  max={8}  step={0.25} suf="%" hint="4% rule = need 25× annual spending. Lower = safer but requires more savings."/>
      <SL label="Home Appreciation Rate"  k="homeApp" min={0}  max={10} step={0.5}  suf="%" hint="Canadian avg ~4%/yr. Varies widely by city."/>
      <div style={{padding:12,background:"#f9fafb",borderRadius:8,border:"1px solid #f0f0f0",marginTop:4}}>
        <p style={{fontSize:11,fontWeight:700,color:"#374151",margin:"0 0 8px"}}>Est. Government Benefits</p>
        {[["CPP (annual)",c.cpp],["OAS (annual)",c.oas]].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,color:"#6b7280"}}>{l}</span>
            <span style={{fontSize:12,fontWeight:700,color:"#059669"}}>+{fmt(v)}</span>
          </div>
        ))}
        <p style={{fontSize:10,color:"#9ca3af",margin:"6px 0 0"}}>CPP ~70% of max for {Math.min(Math.max(inp.retAge-22,0),39)} yrs. OAS paid at 65 — ~$8,784/yr regardless of work history.</p>
      </div>
    </>;

    return (
      <div>
        <p style={{fontSize:14,fontWeight:700,color:"#111827",margin:"0 0 4px"}}>📖 FIRE Glossary</p>
        <p style={{fontSize:12,color:"#9ca3af",margin:"0 0 16px"}}>Plain-English definitions. No jargon.</p>
        {GUIDE.map(s=>(
          <div key={s.title} style={{marginBottom:20}}>
            <p style={{fontSize:10,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:"0.06em",margin:"0 0 8px",paddingBottom:6,borderBottom:"2px solid #f3f4f6"}}>{s.title}</p>
            {s.items.map(({t,d})=>(
              <div key={t} style={{marginBottom:10,padding:"10px 12px",background:"#f9fafb",borderRadius:8,border:"1px solid #f0f0f0"}}>
                <p style={{fontSize:12,fontWeight:700,color:"#1d4ed8",margin:"0 0 4px"}}>{t}</p>
                <p style={{fontSize:11,color:"#6b7280",margin:0,lineHeight:1.6}}>{d}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  // ── dashboard ─────────────────────────────────────────────────────────────
  const footer = (
    <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:4}}>
      <div style={{background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",borderRadius:12,padding:"20px 24px"}}>
        <p style={{fontSize:14,fontWeight:700,color:"#fff",margin:"0 0 4px"}}>Get monthly Canadian FIRE insights</p>
        <p style={{fontSize:11,color:"rgba(255,255,255,0.8)",margin:"0 0 14px"}}>Real numbers. Real strategies. No fluff.</p>
        <a href="https://vestly.beehiiv.com/subscribe" target="_blank" rel="noopener noreferrer"
          style={{display:"inline-block",padding:"10px 20px",background:"#fff",color:"#1d4ed8",borderRadius:8,fontSize:13,fontWeight:700,textDecoration:"none"}}>Subscribe — it's free</a>
      </div>
      <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:"0 0 3px"}}>Ready to start investing?</p>
          <p style={{fontSize:11,color:"#6b7280",margin:0}}>Open a Questrade account and get <strong style={{color:"#059669"}}>$50 in free trades</strong>.</p>
        </div>
        <a href="https://start.questrade.com/?oaa_promo=685817906487902" target="_blank" rel="noopener noreferrer"
          style={{flexShrink:0,display:"inline-block",padding:"10px 16px",background:"#e8173e",color:"#fff",borderRadius:8,fontSize:12,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>Open Questrade →</a>
      </div>
      <div style={{background:"#f9fafb",borderRadius:12,padding:"16px 20px",border:"1px solid #f0f0f0"}}>
        <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:"0 0 6px"}}>👋 Built by Nikhil</p>
        <p style={{fontSize:11,color:"#6b7280",margin:0,lineHeight:1.6}}>A Canadian DIY investor based in Ontario. Built because no calculator understood the full Canadian picture — TFSA, RRSP, CPP, OAS, mortgage payoff, all of it together. <a href="mailto:privacy@getvestly.ca?subject=Vestly Feedback" style={{color:"#1d4ed8"}}>Send feedback →</a></p>
      </div>
      <div style={{textAlign:"center",padding:"4px 0 8px"}}>
        <p style={{fontSize:10,color:"#d1d5db",margin:"0 0 4px"}}>For illustrative purposes only. Not financial advice.</p>
        <p style={{fontSize:10,color:"#d1d5db",margin:0}}>🔒 Data never stored or shared. © {new Date().getFullYear()} Vestly</p>
      </div>
    </div>
  );

  const dash = () => {
    if(dt===1) return <>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["Already Invested",fmtS(c.nw),"Current balances","#1d4ed8"],["Future Contributions",fmtS(c.futPrin),`Cash over ${c.n} yrs`,"#7c3aed"],["Total Principal",fmtS(c.totPrin),"No growth","#374151"],["Market Gains",fmtS(c.gains),`${c.mult.toFixed(2)}× your money`,"#059669"]].map(([l,v,s,cl])=>(
          <div key={l} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #f0f0f0"}}>
            <p style={{fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase",margin:"0 0 4px"}}>{l}</p>
            <p style={{fontSize:18,fontWeight:800,color:cl,margin:"0 0 2px"}}>{v}</p>
            <p style={{fontSize:10,color:"#9ca3af",margin:0}}>{s}</p>
          </div>
        ))}
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #f0f0f0"}}>
        <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:"0 0 4px"}}>What You Put In vs What It Becomes</p>
        <p style={{fontSize:11,color:"#6b7280",margin:"0 0 12px"}}>Blue = cash contributed. Green = portfolio with compound growth.</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={c.contData} margin={{top:5,right:5,left:5,bottom:0}}>
            <defs>
              <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.2}/><stop offset="95%" stopColor="#059669" stopOpacity={0.02}/></linearGradient>
              <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.3}/><stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.05}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
            <XAxis dataKey="age" tick={{fontSize:10,fill:"#9ca3af"}} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtS(v)} tick={{fontSize:10,fill:"#9ca3af"}} tickLine={false} axisLine={false}/>
            <Tooltip content={<TTip/>}/>
            <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#059669" fill="url(#cg1)" strokeWidth={2} dot={false}/>
            <Area type="monotone" dataKey="principal"  name="Principal"  stroke="#1d4ed8" fill="url(#cg2)" strokeWidth={2} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {[["TFSA today",fmt(inp.tfsa),"#1d4ed8"],["RRSP today",fmt(inp.rrsp),"#1d4ed8"],["Non-registered today",fmt(inp.nonReg),"#1d4ed8"],["Future contributions (nominal)",fmt(c.futPrin),"#7c3aed"],["Total principal (no growth)",fmt(c.totPrin),"#374151"],["Projected portfolio at retirement",fmt(c.projNW),"#059669"],["Market gains",fmt(c.gains),"#059669"]].map(([l,v,cl])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
          <span style={{fontSize:12,color:"#6b7280"}}>{l}</span>
          <span style={{fontSize:12,fontWeight:700,color:cl}}>{v}</span>
        </div>
      ))}
      {c.mult>0&&<div style={{marginTop:12,padding:"12px 14px",background:"#eff6ff",borderRadius:8}}>
        <p style={{fontSize:12,color:"#1e40af",margin:0}}>Every <strong>$1</strong> invested at {inp.ret}% over {c.n} years becomes <strong>${c.mult.toFixed(2)}</strong>.</p>
      </div>}
    </>;

    if(dt===2) return <>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["Portfolio at Retirement",fmtS(c.projNW),`Age ${inp.retAge} · ${inp.ret}% return`,c.projNW>=c.fireNum?"#059669":"#dc2626"],["FIRE Number",fmtS(c.fireNum),"What you need","#7c3aed"],[c.portSurplus>=0?"Surplus":"Shortfall",fmtS(Math.abs(c.portSurplus)),c.portSurplus>=0?"Above target":"Below target",c.portSurplus>=0?"#059669":"#dc2626"],["Home Value",fmtS(c.projHome),"Mortgage-free","#78716c"]].map(([l,v,s,cl])=>(
          <div key={l} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #f0f0f0"}}>
            <p style={{fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase",margin:"0 0 4px"}}>{l}</p>
            <p style={{fontSize:18,fontWeight:800,color:cl,margin:"0 0 2px"}}>{v}</p>
            <p style={{fontSize:10,color:"#9ca3af",margin:0}}>{s}</p>
          </div>
        ))}
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #f0f0f0"}}>
        <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:"0 0 12px"}}>Monthly Income at Retirement</p>
        {[["From portfolio (SWR "+inp.swr+"%)",c.mPort,"#1d4ed8"],["CPP (Canada Pension Plan)",c.mCPP,"#059669"],["OAS (Old Age Security)",c.mOAS,"#059669"]].map(([l,v,cl])=>(
          <div key={l} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:12,color:"#6b7280"}}>{l}</span>
              <span style={{fontSize:13,fontWeight:700,color:cl}}>{fmt(v)}</span>
            </div>
            <div style={{background:"#f3f4f6",borderRadius:99,height:6}}>
              <div style={{height:"100%",borderRadius:99,background:cl,width:`${Math.min((v/(c.totInc||1))*100,100)}%`}}/>
            </div>
          </div>
        ))}
        <p style={{fontSize:10,color:"#9ca3af",margin:"8px 0 0",lineHeight:1.5}}><strong style={{color:"#374151"}}>CPP</strong> — earned through work, available from 60. <strong style={{color:"#374151"}}>OAS</strong> — flat govt benefit at 65 (~$8,784/yr). Retiring before 65 means $0 OAS until then.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{padding:"12px 14px",background:c.surplus>=0?"#ecfdf5":"#fef2f2",borderRadius:10,border:`1px solid ${c.surplus>=0?"#6ee7b7":"#fca5a5"}`}}>
          <p style={{fontSize:10,fontWeight:700,color:c.surplus>=0?"#065f46":"#991b1b",textTransform:"uppercase",margin:"0 0 4px"}}>Monthly {c.surplus>=0?"surplus":"shortfall"}</p>
          <p style={{fontSize:20,fontWeight:900,color:c.surplus>=0?"#059669":"#dc2626",margin:"0 0 2px"}}>{fmt(Math.abs(c.surplus))}</p>
          <p style={{fontSize:10,color:c.surplus>=0?"#15803d":"#b91c1c",margin:0}}>{c.surplus>=0?"Income exceeds expenses":"Expenses exceed income"}</p>
        </div>
        <div style={{padding:"12px 14px",background:"#f9fafb",borderRadius:10,border:"1px solid #f0f0f0"}}>
          <p style={{fontSize:10,fontWeight:700,color:"#6b7280",textTransform:"uppercase",margin:"0 0 4px"}}>Portfolio lasts until</p>
          <p style={{fontSize:20,fontWeight:900,color:c.portLasts+inp.retAge>=inp.life?"#059669":"#d97706",margin:"0 0 2px"}}>Age {c.portLasts>60?"90+":`${Math.round(c.portLasts+inp.retAge)}`}</p>
          <p style={{fontSize:10,color:"#9ca3af",margin:0}}>{inp.swr}% SWR · life exp {inp.life}</p>
        </div>
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #f0f0f0"}}>
        <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:"0 0 10px"}}>Full Balance Sheet at Age {inp.retAge}</p>
        {[["Investment portfolio",fmt(c.projNW),"#1d4ed8","TFSA + RRSP + non-reg"],["Home (paid off)",fmt(c.projHome),"#78716c","Not in FIRE portfolio"],["RESP (education)",fmt(c.projRESP),"#059669","Earmarked for children"],["FIRE number needed",fmt(c.fireNum),"#7c3aed","To sustain retirement"],[c.portSurplus>=0?"Surplus":"Shortfall",(c.portSurplus>=0?"+":"")+fmt(c.portSurplus),c.portSurplus>=0?"#059669":"#dc2626","vs FIRE number"]].map(([l,v,cl,note])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}>
            <div><p style={{fontSize:12,color:"#374151",margin:"0 0 1px",fontWeight:500}}>{l}</p><p style={{fontSize:10,color:"#9ca3af",margin:0}}>{note}</p></div>
            <span style={{fontSize:13,fontWeight:700,color:cl,marginLeft:8}}>{v}</span>
          </div>
        ))}
      </div>
    </>;

    return <>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["FIRE Number",fmtS(c.fireNum),"Portfolio needed","#7c3aed"],["Current Portfolio",fmtS(c.nw),"Investable net worth","#1d4ed8"],["Projected at Retire",fmtS(c.projNW),`At age ${inp.retAge}`,c.projNW>=c.fireNum?"#059669":"#dc2626"],["Savings Rate",`${c.savR.toFixed(0)}%`,"Of after-tax income",c.savR>=20?"#059669":"#d97706"]].map(([l,v,s,cl])=>(
          <div key={l} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #f0f0f0"}}>
            <p style={{fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase",margin:"0 0 4px"}}>{l}</p>
            <p style={{fontSize:18,fontWeight:800,color:cl,margin:"0 0 2px"}}>{v}</p>
            <p style={{fontSize:10,color:"#9ca3af",margin:0}}>{s}</p>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["Retirement expenses",fmt(c.mre)+"/mo","Saves "+fmt(c.debtPmt)+"/mo — no mortgage","#1d4ed8","#059669"],["Annual need from portfolio",fmt(c.portNeed),"After CPP "+fmtS(c.cpp)+" + OAS "+fmtS(c.oas),"#7c3aed","#9ca3af"],["Contribution FV",fmtS(c.cFV),"Growing "+inp.incGrowth+"%/yr",c.g>0?"#059669":"#374151","#9ca3af"],["Home at "+inp.retAge,fmtS(c.projHome),"Mortgage-free · separate asset","#374151","#9ca3af"]].map(([l,v,s,cl,sc])=>(
          <div key={l} style={{background:l.startsWith("Home")?"#fafaf9":"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #f0f0f0"}}>
            <p style={{fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase",margin:"0 0 3px"}}>{l}</p>
            <p style={{fontSize:17,fontWeight:800,color:cl,margin:"0 0 2px"}}>{v}</p>
            <p style={{fontSize:10,color:sc,margin:0}}>{s}</p>
          </div>
        ))}
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #f0f0f0"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>Progress to FIRE</span>
          <span style={{fontSize:13,fontWeight:700,color:c.sc}}>{progPct.toFixed(1)}%</span>
        </div>
        <div style={{background:"#f3f4f6",borderRadius:99,height:10,overflow:"hidden",marginBottom:6}}>
          <div style={{height:"100%",borderRadius:99,background:"linear-gradient(90deg,#1d4ed8,#7c3aed)",width:`${progPct}%`,transition:"width 0.5s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:11,color:"#9ca3af"}}>{fmtS(c.nw)} saved</span>
          <span style={{fontSize:11,color:"#9ca3af"}}>{fmtS(c.fireNum)} target</span>
        </div>
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #f0f0f0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:0}}>Net Worth Projection</p>
          <div style={{display:"flex",gap:10}}>
            {[["Portfolio","#1d4ed8"],["Target","#dc2626"],["Home","#92400e"]].map(([l,cl])=>(
              <span key={l} style={{fontSize:10,color:"#6b7280",display:"flex",alignItems:"center",gap:3}}>
                <span style={{width:10,height:2,background:cl,display:"inline-block",borderRadius:2}}></span>{l}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={c.chart} margin={{top:5,right:5,left:5,bottom:0}}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.18}/><stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.01}/></linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.13}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0.01}/></linearGradient>
              <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#92400e" stopOpacity={0.12}/><stop offset="95%" stopColor="#92400e" stopOpacity={0.01}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
            <XAxis dataKey="age" tick={{fontSize:10,fill:"#9ca3af"}} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtS(v)} tick={{fontSize:10,fill:"#9ca3af"}} tickLine={false} axisLine={false}/>
            <Tooltip content={<TTip/>}/>
            <ReferenceLine x={inp.retAge} stroke="#6b7280" strokeDasharray="4 4" label={{value:"Retire",position:"top",fontSize:9,fill:"#6b7280"}}/>
            <Area type="monotone" dataKey="home"    name="Home"      stroke="#92400e" fill="url(#g3)" strokeWidth={1.5} dot={false} strokeDasharray="4 3"/>
            <Area type="monotone" dataKey="ideal"   name="Ideal"     stroke="#7c3aed" fill="url(#g2)" strokeWidth={1.5} dot={false} strokeDasharray="5 4" connectNulls={false}/>
            <Area type="monotone" dataKey="nw"      name="Portfolio" stroke="#1d4ed8" fill="url(#g1)" strokeWidth={2}   dot={false}/>
            <Area type="monotone" dataKey="fire"    name="Target"    stroke="#dc2626" fill="none"      strokeWidth={1.5} dot={false} strokeDasharray="6 3"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {inp.kids>0&&<div style={{background:"#f0fdf4",borderRadius:10,padding:14,border:"1px solid #d1fae5"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,background:"#059669",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff"}}>🎓</div>
            <div>
              <p style={{fontSize:13,fontWeight:700,color:"#065f46",margin:0}}>RESP</p>
              <p style={{fontSize:10,color:"#6b7280",margin:0}}>{inp.kids} child{inp.kids!==1?"ren":""} · {c.y18} yrs to post-secondary</p>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{fontSize:10,color:"#6b7280",margin:"0 0 1px"}}>Projected at 18</p>
            <p style={{fontSize:16,fontWeight:800,color:"#059669",margin:0}}>{fmtS(c.projRESP)}</p>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["Monthly contribution",fmt(inp.mRESP),"#374151"],["Annual CESG",`+${fmt(c.totCESG)}`,"#059669"],["Lifetime CESG",`+${fmt(c.lifeCESG)}`,"#059669"],["RESP today",fmt(inp.respBal),"#374151"]].map(([l,v,cl])=>(
            <div key={l} style={{background:"#fff",borderRadius:8,padding:"9px 11px",border:"1px solid #d1fae5"}}>
              <p style={{fontSize:10,color:"#6b7280",margin:"0 0 2px",textTransform:"uppercase",fontWeight:600}}>{l}</p>
              <p style={{fontSize:13,fontWeight:700,color:cl,margin:0}}>{v}</p>
            </div>
          ))}
        </div>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #f0f0f0"}}>
          <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:"0 0 10px"}}>Gap Analysis</p>
          {c.cAlone&&<div style={{padding:"9px 12px",background:"#ecfdf5",borderRadius:8,border:"1px solid #6ee7b7",marginBottom:10}}>
            <p style={{fontSize:11,fontWeight:700,color:"#065f46",margin:"0 0 2px"}}>Contributions cover FIRE target</p>
            <p style={{fontSize:10,color:"#15803d",margin:0}}>Every dollar saved is pure upside.</p>
          </div>}
          {[["Portfolio today",fmt(c.nw),"#1d4ed8",null],["Ideal today",fmt(c.ideal),"#7c3aed","ideal"],["Gap",c.gap>0?`–${fmt(c.gap)}`:`+${fmt(-c.gap)}`,c.gap>0?"#dc2626":"#059669","gap"],["FIRE number",fmt(c.fireNum),"#374151",null],["Projected",fmt(c.projNW),c.projNW>=c.fireNum?"#059669":"#dc2626",null],["Home at retire",fmtS(c.projHome),"#78716c",null]].map(([l,v,cl,tipId])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f3f4f6"}}>
              <span style={{fontSize:11,color:"#6b7280",display:"flex",alignItems:"center"}}>{l}{tipId&&<Tip id={tipId}/>}</span>
              <span style={{fontSize:11,fontWeight:700,color:cl}}>{v}</span>
            </div>
          ))}
          <div style={{marginTop:10,padding:"8px 10px",background:"#f0fdf4",borderRadius:7}}>
            <p style={{fontSize:10,fontWeight:700,color:"#166634",margin:"0 0 2px"}}>Govt Benefits</p>
            <p style={{fontSize:10,color:"#15803d",margin:0}}>CPP ~{fmt(c.cpp)}/yr · OAS ~{fmt(c.oas)}/yr{c.oas===0?" (at 65)":""}</p>
          </div>
        </div>
        <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #f0f0f0"}}>
          <p style={{fontSize:13,fontWeight:700,color:"#111827",margin:"0 0 10px"}}>{ahead?"On Track 🎯":"Course Corrections"}</p>
          {ahead
            ? <div>
                <p style={{fontSize:12,color:"#059669",fontWeight:600,margin:"0 0 8px"}}>Projected {fmtS(c.projNW)} exceeds {fmtS(c.fireNum)} target.</p>
                <div style={{padding:10,background:"#ecfdf5",borderRadius:8}}>
                  <p style={{fontSize:11,color:"#065f46",margin:0}}>FIRE at age <strong>{c.fireAge}</strong>{c.fireAge<inp.retAge?` — ${inp.retAge-c.fireAge} yrs early!`:""}</p>
                </div>
              </div>
            : [{icon:"$",text:`+${fmt(c.extra)}/mo more`,desc:"Closes gap by retirement"},{icon:"↔",text:`Delay ${c.delay} yr${c.delay!==1?"s":""}`,desc:"More growth time"},{icon:"↓",text:`Cut spending ${c.spendCut.toFixed(0)}%`,desc:"Lowers FIRE number"}].map(({icon,text,desc})=>(
                <div key={text} style={{marginBottom:10,padding:"10px 12px",background:"#f9fafb",borderRadius:8,border:"1px solid #f0f0f0"}}>
                  <p style={{fontSize:12,fontWeight:600,color:"#111827",margin:"0 0 2px"}}><span style={{color:"#1d4ed8",marginRight:5}}>{icon}</span>{text}</p>
                  <p style={{fontSize:11,color:"#9ca3af",margin:0}}>{desc}</p>
                </div>
              ))
          }
        </div>
      </div>
      {footer}
    </>;
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <FormCtx.Provider value={ctxVal}>
      <div style={{display:"flex",flexDirection:"column",minHeight:"100vh",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:"#f8fafc"}}>
        {/* header */}
        <div style={{background:"#fff",borderBottom:"1px solid #e5e7eb",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
                <path d="M9 1C9 1 4 6.5 4 10.5C4 13.5 6.2 16 9 16C11.8 16 14 13.5 14 10.5C14 10.5 12.5 12 11 12C11 12 14 8.5 9 1Z" fill="white"/>
                <path d="M9 15C7.6 15 6.5 16.1 6.5 17.5C6.5 18.9 7.6 20 9 20C10.4 20 11.5 18.9 11.5 17.5C11.5 16.1 10.4 15 9 15Z" fill="rgba(255,255,255,0.85)"/>
              </svg>
            </div>
            <div>
              <p style={{fontSize:15,fontWeight:800,color:"#111827",margin:0,letterSpacing:"-0.02em"}}>Vestly</p>
              <p style={{fontSize:10,color:"#9ca3af",margin:0}}>Canadian FIRE Calculator</p>
            </div>
          </div>
          <button onClick={()=>setShow(s=>!s)} style={{padding:"8px 14px",background:show?"#1d4ed8":"#f3f4f6",color:show?"#fff":"#374151",border:"none",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer"}}>
            {show?"✕ Close":"⚙ Edit Inputs"}
          </button>
        </div>

        {/* status bar */}
        <div style={{background:c.sbg,borderBottom:`1px solid ${c.sb}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <p style={{fontSize:10,fontWeight:700,color:c.sc,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 2px"}}>FIRE Status</p>
            <p style={{fontSize:20,fontWeight:900,color:c.sc,margin:0}}>{c.status}</p>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{fontSize:12,color:c.sc,fontWeight:600,margin:"0 0 2px"}}>{c.gap>0?`${fmtS(c.gap)} behind`:`${fmtS(-c.gap)} ahead`}</p>
            <p style={{fontSize:12,color:"#374151",margin:0}}>FIRE at age <strong style={{color:c.fireAge<=inp.retAge?"#059669":"#d97706"}}>{c.fireAge}{c.fireAge>inp.retAge?` (+${c.fireAge-inp.retAge}yr)`:c.fireAge<inp.retAge?` (${inp.retAge-c.fireAge}yr early!)`:""}</strong></p>
          </div>
        </div>

        <div style={{display:"flex",flex:1,overflow:"hidden",position:"relative"}}>
          {show&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",zIndex:40}} onClick={()=>setShow(false)}/>}

          {/* sidebar */}
          <div style={{position:"fixed",top:0,bottom:0,left:0,width:320,background:"#fff",zIndex:45,transform:show?"translateX(0)":"translateX(-100%)",transition:"transform 0.25s ease",display:"flex",flexDirection:"column",boxShadow:show?"4px 0 20px rgba(0,0,0,0.15)":"none",overflowY:"auto"}}>
            <div style={{padding:"16px 16px 0",position:"sticky",top:0,background:"#fff",borderBottom:"1px solid #f0f0f0",zIndex:1}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <p style={{fontSize:14,fontWeight:700,color:"#111827",margin:0}}>Your Numbers</p>
                <button onClick={()=>setShow(false)} style={{border:"none",background:"#f3f4f6",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:12,color:"#6b7280"}}>Done ✓</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,paddingBottom:12}}>
                {STABS.map((t,idx)=>(
                  <button key={idx} onClick={()=>setSt(idx)} style={{padding:"8px 4px",fontSize:11,fontWeight:600,borderRadius:7,border:"none",cursor:"pointer",background:st===idx?"#1d4ed8":"#f3f4f6",color:st===idx?"#fff":"#6b7280",textAlign:"center",lineHeight:1.3}}>{t}</button>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:12,padding:"8px 10px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}}>
                <span style={{fontSize:12,flexShrink:0}}>🔒</span>
                <p style={{fontSize:10,color:"#166534",margin:0,lineHeight:1.5}}>Data calculated locally in your browser. Never stored or shared.</p>
              </div>
            </div>
            <div style={{padding:16,flex:1}}>{sidebar()}</div>
          </div>

          {/* main */}
          <div style={{flex:1,overflowY:"auto",padding:"12px 16px 24px",maxWidth:800,margin:"0 auto",width:"100%"}}>
            <div style={{display:"flex",gap:4,marginBottom:14,background:"#f3f4f6",borderRadius:10,padding:4}}>
              {DTABS.map((t,idx)=>(
                <button key={idx} onClick={()=>setDt(idx)} style={{flex:1,padding:"8px 4px",fontSize:12,fontWeight:600,borderRadius:7,border:"none",cursor:"pointer",background:dt===idx?"#fff":"transparent",color:dt===idx?"#111827":"#6b7280",boxShadow:dt===idx?"0 1px 3px rgba(0,0,0,0.1)":undefined,transition:"all 0.15s"}}>{t}</button>
              ))}
            </div>
            <div style={{marginBottom:12,padding:"12px 14px",background:"#f8fafc",borderRadius:8,border:"1px solid #e5e7eb"}}>
              {dt===0&&<><p style={{fontSize:12,fontWeight:700,color:"#111827",margin:"0 0 4px"}}>📊 Overview</p><p style={{fontSize:11,color:"#6b7280",margin:0,lineHeight:1.6}}>Your complete FIRE snapshot. Shows your FIRE number, current portfolio, projected value at retirement, and progress toward financial independence. Gap analysis tells you where you stand on the ideal savings path. Course corrections show the three levers you can pull if you're behind.</p></>}
              {dt===1&&<><p style={{fontSize:12,fontWeight:700,color:"#111827",margin:"0 0 4px"}}>💰 Contributions</p><p style={{fontSize:11,color:"#6b7280",margin:0,lineHeight:1.6}}>The difference between what you physically put in (principal) and what your portfolio becomes with compound growth. The gap between the two lines is what the market does for you — for free, over time. Shows why starting early matters more than contributing more later.</p></>}
              {dt===2&&<><p style={{fontSize:12,fontWeight:700,color:"#111827",margin:"0 0 4px"}}>🏖️ Retirement Snapshot</p><p style={{fontSize:11,color:"#6b7280",margin:0,lineHeight:1.6}}>Your complete picture on retirement day. Monthly income breakdown (portfolio + CPP + OAS), whether that covers your expenses, how long your portfolio lasts, and your full balance sheet including home equity and RESP.</p></>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>{dash()}</div>
          </div>
        </div>
      </div>
    </FormCtx.Provider>
  );
}
