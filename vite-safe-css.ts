import { Plugin } from "vite";

export function safeCssInject(): Plugin {
  return {
    name: "safe-css-inject",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" && file.code) {
          file.code = file.code.replace(
            /document\.head\.appendChild\(([a-zA-Z0-9_$]+)\)/g,
            `((function(el){function _ins(){var p=document.head||document.documentElement||document.body;if(p){p.appendChild(el);}else{document.addEventListener("DOMContentLoaded",_ins,{once:true});}}_ins();})($1))`,
          );
        }
      }
    },
  };
}
