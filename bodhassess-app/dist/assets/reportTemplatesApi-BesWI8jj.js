import{a as e}from"./apiClient-C3ebzxDW.js";const r="/report-computations",i=async t=>{try{return await t()}catch(a){const n=a?.response?.data;if(n instanceof Blob)try{const o=JSON.parse(await n.text());if(o?.message){const d=new Error(o.message);throw d.response={...a.response,data:o},d}}catch(o){if(o?.message&&o.message!==a.message)throw o}throw a}},l={getAll:async()=>(await e.get(`${r}/getAll`)).data,getById:async t=>(await e.get(`${r}/getById/${t}`)).data,create:async t=>(await e.post(`${r}/create`,t)).data,update:async(t,a)=>(await e.put(`${r}/update/${t}`,a)).data,markReady:async t=>(await e.post(`${r}/markReady/${t}`)).data,approve:async t=>(await e.post(`${r}/approve/${t}`)).data,previewPdfUrl:async(t,a)=>i(async()=>{const n=await e.get(`${r}/preview/${t}/${a}.pdf`,{responseType:"blob"});return URL.createObjectURL(n.data)}),generate:async t=>i(async()=>{const a=await e.post(`${r}/generate/${t}`,null,{responseType:"blob"}),o=String(a.headers["content-disposition"]||"").match(/filename="?([^"]+)"?/);return{blob:a.data,fileName:o?o[1]:`reports-${t}.zip`,count:Number(a.headers["x-report-count"]||0),skipped:Number(a.headers["x-report-skipped"]||0)}}),reopen:async t=>(await e.post(`${r}/reopen/${t}`)).data,delete:async t=>{await e.delete(`${r}/delete/${t}`)}},m=["CORE","LITERAL","COMPUTED","VALUE"],p=["COMPUTED","VALUE","NARRATIVE","TABLE","CHART"],$=t=>p.includes(t),s="/report-templates",y={getAll:async()=>(await e.get(`${s}/getAll`)).data,getById:async t=>(await e.get(`${s}/getById/${t}`)).data,coreFields:async()=>(await e.get(`${s}/coreFields`)).data,create:async t=>(await e.post(`${s}/create`,t)).data,update:async(t,a)=>(await e.put(`${s}/update/${t}`,a)).data,bindTag:async(t,a,n)=>(await e.put(`${s}/bindTag/${t}/${encodeURIComponent(a)}`,n)).data,publish:async t=>(await e.post(`${s}/publish/${t}`)).data,newVersion:async t=>(await e.post(`${s}/newVersion/${t}`)).data,delete:async t=>{await e.delete(`${s}/delete/${t}`)},previewPdfUrl:async t=>{const a=await e.get(`${s}/preview/${t}.pdf`,{responseType:"blob"});return URL.createObjectURL(a.data)},previewHtml:async t=>(await e.get(`${s}/preview/${t}.html`,{responseType:"text"})).data},g=`<html>
<head>
<meta charset="utf-8"/>
<style>
  /* CSS 2.1 only — no flexbox, no grid, no JavaScript. */
  @page {
    size: A4;
    margin: 18mm 15mm 20mm 15mm;
    /* A margin box does NOT inherit body's font. Without this the page
       number renders in an unembedded font. */
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: "Noto Sans Devanagari"; font-size: 8pt; color: #888;
    }
  }
  body { font-family: "Noto Sans Devanagari"; font-size: 10pt; color: #222; }
  h1 { font-size: 15pt; color: #2b5c8a; margin: 0 0 4px; }
  h2 { font-size: 12pt; color: #2b5c8a; border-bottom: 1px solid #d5dde5;
       padding-bottom: 3px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  td { padding: 4px 6px; border: 1px solid #cfd9e3; }
  td.k { color: #666; width: 38%; }
</style>
</head>
<body>

  <h1>\${reportTitle}</h1>

  <h2>Respondent</h2>
  <table>
    <tr><td class="k">Name</td><td>\${respondentName}</td></tr>
    <tr><td class="k">Date of birth</td><td>\${dateOfBirth}</td></tr>
    <tr><td class="k">Organization</td><td>\${organization}</td></tr>
    <tr><td class="k">Report date</td><td>\${reportDate}</td></tr>
  </table>

  <h2>Notes</h2>
  <p>\${disclaimer}</p>

</body>
</html>
`;export{m as I,g as S,y as a,$ as i,l as r};
