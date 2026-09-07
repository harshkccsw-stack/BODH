import{a as e}from"./apiClient-BYPZafGP.js";const r=["CORE","LITERAL","COMPUTED"],n=["COMPUTED","VALUE","NARRATIVE","TABLE","CHART"],i=t=>n.includes(t),a="/report-templates",p={getAll:async()=>(await e.get(`${a}/getAll`)).data,getById:async t=>(await e.get(`${a}/getById/${t}`)).data,coreFields:async()=>(await e.get(`${a}/coreFields`)).data,create:async t=>(await e.post(`${a}/create`,t)).data,update:async(t,o)=>(await e.put(`${a}/update/${t}`,o)).data,bindTag:async(t,o,d)=>(await e.put(`${a}/bindTag/${t}/${encodeURIComponent(o)}`,d)).data,publish:async t=>(await e.post(`${a}/publish/${t}`)).data,newVersion:async t=>(await e.post(`${a}/newVersion/${t}`)).data,delete:async t=>{await e.delete(`${a}/delete/${t}`)},previewPdfUrl:async t=>{const o=await e.get(`${a}/preview/${t}.pdf`,{responseType:"blob"});return URL.createObjectURL(o.data)},previewHtml:async t=>(await e.get(`${a}/preview/${t}.html`,{responseType:"text"})).data},c=`<html>
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
`;export{r as I,c as S,i,p as r};
