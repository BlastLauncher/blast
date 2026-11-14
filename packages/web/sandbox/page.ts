/**
 * The cross-origin sandbox page: it runs almostnode's full runtime and answers
 * the host's `execute` messages. `runtimeModule` is the URL of the sandbox
 * build of almostnode (`almostnode-full.mjs`) relative to this page.
 */
export const sandboxPage = (runtimeModule: string): string =>
  `<!doctype html><script type="module">import {Runtime,VirtualFS} from '${runtimeModule}'; const runtime=new Runtime(new VirtualFS(),{}); addEventListener('message',async e=>{if(e.data?.type==='execute'){try{const result=await runtime.execute(e.data.code,e.data.filename); parent.postMessage({type:'result',id:e.data.id,result},'*')}catch(error){parent.postMessage({type:'error',id:e.data.id,error:String(error)},'*')}}}); parent.postMessage({type:'ready'},'*');</script>`;
