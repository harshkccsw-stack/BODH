import{a}from"./apiClient-BW4CiuXf.js";const s="/report-computations",i=async t=>{try{return await t()}catch(e){const n=e?.response?.data;if(n instanceof Blob)try{const r=JSON.parse(await n.text());if(r?.message){const d=new Error(r.message);throw d.response={...e.response,data:r},d}}catch(r){if(r?.message&&r.message!==e.message)throw r}throw e}},l={getAll:async()=>(await a.get(`${s}/getAll`)).data,getById:async t=>(await a.get(`${s}/getById/${t}`)).data,create:async t=>(await a.post(`${s}/create`,t)).data,update:async(t,e)=>(await a.put(`${s}/update/${t}`,e)).data,markReady:async t=>(await a.post(`${s}/markReady/${t}`)).data,approve:async t=>(await a.post(`${s}/approve/${t}`)).data,previewPdfUrl:async(t,e)=>i(async()=>{const n=await a.get(`${s}/preview/${t}/${e}.pdf`,{responseType:"blob"});return URL.createObjectURL(n.data)}),generate:async t=>i(async()=>{const e=await a.post(`${s}/generate/${t}`,null,{responseType:"blob"}),r=String(e.headers["content-disposition"]||"").match(/filename="?([^"]+)"?/);return{blob:e.data,fileName:r?r[1]:`reports-${t}.zip`,count:Number(e.headers["x-report-count"]||0),skipped:Number(e.headers["x-report-skipped"]||0)}}),rename:async(t,e)=>(await a.put(`${s}/rename/${t}`,{name:e})).data,clone:async t=>(await a.post(`${s}/clone/${t}`)).data,archive:async t=>(await a.post(`${s}/archive/${t}`)).data,reopen:async t=>(await a.post(`${s}/reopen/${t}`)).data,clearNarratives:async t=>(await a.post(`${s}/clearNarratives/${t}`)).data,delete:async t=>{await a.delete(`${s}/delete/${t}`)}},$=["CORE","LITERAL","COMPUTED","VALUE","NARRATIVE"],p=["COMPUTED","VALUE","NARRATIVE","TABLE","CHART"],m=t=>p.includes(t),o="/report-templates",y={getAll:async()=>(await a.get(`${o}/getAll`)).data,getById:async t=>(await a.get(`${o}/getById/${t}`)).data,coreFields:async()=>(await a.get(`${o}/coreFields`)).data,create:async t=>(await a.post(`${o}/create`,t)).data,update:async(t,e)=>(await a.put(`${o}/update/${t}`,e)).data,bindTag:async(t,e,n)=>(await a.put(`${o}/bindTag/${t}/${encodeURIComponent(e)}`,n)).data,rename:async(t,e)=>(await a.put(`${o}/rename/${t}`,{name:e})).data,publish:async t=>(await a.post(`${o}/publish/${t}`)).data,newVersion:async t=>(await a.post(`${o}/newVersion/${t}`)).data,delete:async t=>{await a.delete(`${o}/delete/${t}`)},previewPdfUrl:async t=>{const e=await a.get(`${o}/preview/${t}.pdf`,{responseType:"blob"});return URL.createObjectURL(e.data)},previewHtml:async t=>(await a.get(`${o}/preview/${t}.html`,{responseType:"text"})).data},w=`<html>
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
`;export{$ as I,w as S,y as a,m as i,l as r};
