/* Copyright 2026 manko Extension Contributors; SPDX-License-Identifier: Apache-2.0 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(new URL("./source-owned-runtime/15-search.js",import.meta.url),"utf8");
function runtime(globals={}) { const context=vm.createContext({...globals}); vm.runInContext(source,context); return context; }
const candidate=(value,fieldID="tag")=>({fieldID,value,title:value});
test("candidate ranking normalizes only matching and keeps canonical namespaces",()=>{
 const c=runtime();
 assert.equal(c.mrSearchNormalized("  Blúe_sky-GLASSES "),"blue sky glasses");
 assert.equal(c.mrSearchScore("glases","glasses"),401);
 assert.equal(c.mrSearchScore("galses","glasses"),402);
 assert.equal(c.mrSearchScore("gl","gold"),null);
 const result=c.mrRankSuggestions("glass",[candidate("glass"),candidate("glasses","female"),candidate("glasses","male"),candidate("blue glasses"),candidate("sunglasses"),candidate("glasses","female")]);
 assert.deepEqual(Array.from(result,x=>[x.fieldID,x.value]),[["tag","glass"],["female","glasses"],["male","glasses"],["tag","blue glasses"],["tag","sunglasses"]]);
 assert.equal(c.mrRankSuggestions("glases",[candidate("glasses","female"),candidate("glasses","male")],30,"male").length,1);
});
test("lookups coalesce, broaden at most twice, cache only successes and recover",async()=>{
 const c=runtime(); let release; let calls=[];
 const lookup=c.mrCreateSuggestionLookup(async(field,query)=>{ calls.push(query); if(query==="glass") await new Promise(r=>release=r); return query==="gla"||query==="glass"?[candidate("glasses")]:[]; });
 const first=lookup({query:"glass"}),second=lookup({query:"GLASS"});
 await Promise.resolve(); assert.deepEqual(calls,["glass"]); release(); await Promise.all([first,second]);
 assert.equal((await lookup({query:"glases"}))[0].value,"glasses");
 assert.ok(calls.length<=4); const count=calls.length; await lookup({query:"glases"}); assert.equal(calls.length,count);
 let attempts=0; const recovering=c.mrCreateSuggestionLookup(async()=>{ if(++attempts===1) throw new Error("unavailable"); return [candidate("glasses")]; });
 await assert.rejects(recovering({query:"glass"}),/unavailable/); assert.equal((await recovering({query:"glass"})).length,1);
 let malformed=true; const repair=c.mrCreateSuggestionLookup(async()=>malformed?[{value:"invalid"}]:[]);
 await assert.rejects(repair({query:"foo"}),/invalid/); malformed=false; assert.equal((await repair({query:"foo"})).length,0);
});
test("successful suggestion caches expire and evict beyond 100 entries",async()=>{
 let now=0,calls=0; const c=runtime({Date:{now:()=>now}});
 const lookup=c.mrCreateSuggestionLookup(async(_,q)=>{calls++;return [candidate(q)];});
 for(let i=0;i<101;i++) await lookup({query:`key${i}`});
 await lookup({query:"key0"}); assert.equal(calls,102);
 now=300001; await lookup({query:"key100"}); assert.equal(calls,103);
});
