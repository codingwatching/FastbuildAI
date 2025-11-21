import{d as y,s as w,g as l,c as n,o as a,q as e,v as s,l as c,y as $,F as k,B as C,z as D,p as o,x as S,t as p}from"#entry";import{_ as T}from"./BOqcgEQj.js";import"./Bx0Ksjg_.js";import"./Btvd554H.js";import"./3UOIlTK8.js";import"./DuSMYVIA.js";import"./DduSJdeS.js";import"./VGKgjfSv.js";import"./oFTPHjuc.js";import"./BcsO9TDZ.js";const j={class:"space-y-4"},z={class:"mb-2 text-lg font-medium"},B={class:"text-muted-foreground text-sm"},I={key:0,class:"border-border rounded-lg border p-6 text-center"},N={class:"mb-2 font-medium"},U={class:"text-muted-foreground text-sm"},V={key:1,class:"space-y-4"},A={class:"flex border-b"},E=["onClick"],J={class:"space-y-4"},K={key:0,class:"space-y-3"},P={class:"flex items-center justify-between"},q={class:"font-medium"},F={class:"relative"},L={class:"bg-muted overflow-auto rounded-lg p-4 text-sm"},R={class:"text-muted-foreground text-xs"},W={key:1,class:"space-y-3"},H={class:"flex items-center justify-between"},M={class:"relative"},G={class:"bg-muted overflow-auto rounded-lg p-4 text-sm"},O={class:"text-muted-foreground text-xs"},Q={key:2,class:"space-y-3"},X={class:"flex items-center justify-between"},Y={class:"font-medium"},Z={class:"relative"},ee={class:"bg-muted overflow-auto rounded-lg p-4 text-sm"},te={class:"text-muted-foreground text-xs"},se={class:"space-y-3"},oe={class:"font-medium"},ie={class:"border-border flex justify-center rounded-lg border p-6"},ne={class:"border-border overflow-hidden rounded-lg border shadow-lg",style:{width:"100%",height:"750px"}},ae=["src"],ve=y({__name:"embed-code",props:{agent:{}},setup(m){const h=m,d=w("iframe"),i=l(()=>h.agent?.publishToken?`${window.location.origin}/public/agent/shared/${h.agent.publishToken}`:""),b=l(()=>i.value?`<!-- BuildingAI 智能体嵌入代码 -->
<iframe
  src="${i.value}?embed=true"
  width="400"
  height="600"
  frameborder="0"
	style="border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); position: fixed; right: 50px; bottom: 50px; z-index: 999;"
</iframe>`:""),f=l(()=>i.value?`<!-- 使用 JavaScript SDK -->
<div id="chatbot-container"></div>
<script>
  window.BuildingAI = {
    init: function(options) {
      const iframe = document.createElement('iframe');
      iframe.src = '${i.value}?embed=true&sdk=true';
      iframe.width = options.width || '400px';
      iframe.height = options.height || '600px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '10px';
      iframe.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';

      const container = document.querySelector(options.container);
      if (container) {
        container.appendChild(iframe);
      }
    }
  };

  // 初始化智能体
  BuildingAI.init({
    container: '#chatbot-container',
    width: '400px',
    height: '600px'
  });
<\\/script>`:""),g=l(()=>i.value?`<!-- WordPress 短代码 -->
[buildingai_chatbot url="${i.value}" width="400" height="600"]

<!-- 或者直接使用 HTML -->
<div style="width: 400px; height: 600px;">
  <iframe
    src="${i.value}?embed=true"
    width="100%"
    height="100%"
    frameborder="0"
	style="border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); position: fixed; right: 50px; bottom: 50px; z-index: 999;"
  </iframe>
</div>`:""),x=[{value:"iframe",label:"iframe 嵌入",icon:"i-lucide-code"},{value:"javascript",label:"JavaScript SDK",icon:"i-lucide-braces"},{value:"wordpress",label:"WordPress",icon:"i-lucide-wordpress"}];return(t,v)=>{const _=$,u=T;return a(),n("div",j,[e("div",null,[e("h3",z,s(t.$t("ai-agent.backend.publish.embedCode")),1),e("p",B,s(t.$t("ai-agent.backend.publish.embedCodeDesc")),1)]),m.agent?.isPublished?(a(),n("div",V,[e("div",A,[(a(),n(k,null,C(x,r=>e("button",{key:r.value,class:D(["flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",o(d)===r.value?"border-primary text-primary border-b-2":"text-muted-foreground hover:text-foreground"]),onClick:de=>d.value=r.value},[c(_,{name:r.icon,class:"size-4"},null,8,["name"]),S(" "+s(r.label),1)],10,E)),64))]),e("div",J,[o(d)==="iframe"?(a(),n("div",K,[e("div",P,[e("h4",q,s(t.$t("ai-agent.backend.publish.iframeCode")),1),c(u,{content:o(b),variant:"outline",size:"sm",copiedText:t.$t("console-common.messages.copySuccess"),"default-text":t.$t("console-common.copy")},null,8,["content","copiedText","default-text"])]),e("div",F,[e("pre",L,[e("code",null,s(o(b)),1)])]),e("div",R,[e("p",null,"• "+s(t.$t("ai-agent.backend.publish.iframeCodeDesc1")),1),e("p",null,"• "+s(t.$t("ai-agent.backend.publish.iframeCodeDesc2")),1),e("p",null,"• "+s(t.$t("ai-agent.backend.publish.iframeCodeDesc3")),1)])])):p("",!0),o(d)==="javascript"?(a(),n("div",W,[e("div",H,[v[0]||(v[0]=e("h4",{class:"font-medium"},"JavaScript SDK",-1)),c(u,{content:o(f),variant:"outline",size:"sm",copiedText:t.$t("console-common.messages.copySuccess"),"default-text":t.$t("console-common.copy")},null,8,["content","copiedText","default-text"])]),e("div",M,[e("pre",G,[e("code",null,s(o(f)),1)])]),e("div",O,[e("p",null,"• "+s(t.$t("ai-agent.backend.publish.javascriptCodeDesc1")),1),e("p",null,"• "+s(t.$t("ai-agent.backend.publish.javascriptCodeDesc2")),1),e("p",null,"• "+s(t.$t("ai-agent.backend.publish.javascriptCodeDesc3")),1)])])):p("",!0),o(d)==="wordpress"?(a(),n("div",Q,[e("div",X,[e("h4",Y,s(t.$t("ai-agent.backend.publish.wordpressCode")),1),c(u,{content:o(g),variant:"outline",size:"sm",copiedText:t.$t("console-common.messages.copySuccess"),"default-text":t.$t("console-common.copy")},null,8,["content","copiedText","default-text"])]),e("div",Z,[e("pre",ee,[e("code",null,s(o(g)),1)])]),e("div",te,[e("p",null,"• "+s(t.$t("ai-agent.backend.publish.wordpressCodeDesc1")),1),e("p",null,"• "+s(t.$t("ai-agent.backend.publish.wordpressCodeDesc2")),1),e("p",null,"• "+s(t.$t("ai-agent.backend.publish.wordpressCodeDesc3")),1)])])):p("",!0)]),e("div",se,[e("h4",oe,s(t.$t("ai-agent.backend.publish.previewEffect")),1),e("div",ie,[e("div",ne,[e("iframe",{src:`${o(i)}?embed=true&preview=true`,width:"100%",height:"100%",frameborder:"0"},null,8,ae)])])])])):(a(),n("div",I,[c(_,{name:"i-lucide-lock",class:"text-muted-foreground mx-auto mb-3 size-12"}),e("h4",N,s(t.$t("ai-agent.backend.publish.unpublished")),1),e("p",U,s(t.$t("ai-agent.backend.publish.unpublishedDesc2")),1)]))])}}});export{ve as default};
