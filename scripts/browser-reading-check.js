// 供外部 Playwright runner 注入已打开的 page 执行；不把 Playwright 作为扩展运行时依赖。
export default async (page) => {
  const requests = [];
  await page.addInitScript(() => {
    let onConnect;
    const data = { apiKey: 'qa-placeholder', model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com', deepThinking: false };
    window.chrome = {
      runtime: { id: 'qa', onInstalled: { addListener() {} }, openOptionsPage() {},
        onConnect: { addListener(cb) { onConnect = cb; } },
        connect({name}) {
          const front = [], back = [];
          const end = {addListener(){}};
          onConnect({name, onMessage:{addListener(cb){back.push(cb);}}, onDisconnect:end,
            postMessage(msg){front.forEach(cb=>cb(msg));}});
          return {onMessage:{addListener(cb){front.push(cb);}},onDisconnect:end,
            postMessage(msg){back.forEach(cb=>cb(msg));}};
        } },
      storage: { local: { async get(defaults){ return {...defaults,...data}; }, async set(patch){Object.assign(data,patch);} },
        onChanged:{addListener(){}} },
    };
  });
  await page.route('https://api.deepseek.com/chat/completions', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({contentType:'text/event-stream', headers:{'Access-Control-Allow-Origin':'*'},
      body:'data: '+JSON.stringify({choices:[{delta:{content:'浅层的，指网络层数较少的架构。'},finish_reason:null}]})+'\n\n'+
        'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});
  });
  await page.goto('http://localhost:5190/src/pdf/index.html');
  await page.addScriptTag({url:'http://localhost:5191/qa-background.js',type:'module'});
  await page.locator('input[type=file]').setInputFiles('C:/Users/about/Downloads/2201.10703v2.pdf');
  await page.waitForFunction(()=>document.querySelectorAll('.textLayer [data-p="9"]').length>0);
  const select = async (first, last, word) => {
    await page.evaluate(({first,last,word})=>{
      const els=[...document.querySelectorAll('.textLayer [data-i]')];
      const a=els.find(e=>e.textContent.includes(first));
      const b=last?els.find(e=>e.textContent.includes(last)):a;
      if(!a||!b)throw new Error('missing selection fixture');
      a.scrollIntoView({block:'center'});
      document.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      const r=document.createRange();
      r.setStart(a.firstChild,a.textContent.indexOf(first));
      r.setEnd(b.firstChild,last?b.textContent.indexOf(last)+last.length:a.textContent.indexOf(first)+word.length);
      window.getSelection().removeAllRanges();window.getSelection().addRange(r);
      document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    },{first,last,word});
  };
  await select('shallow architectures',null,'shallow');
  await page.waitForFunction(()=>[...document.querySelectorAll('div')].some(e=>e.shadowRoot?.textContent.includes('浅层的，指网络层数较少的架构。')));
  if(requests.length!==1)throw new Error('missing actual API request');
  const first=requests[0];
  const txt=first.messages[1].content;
  if(!txt.includes('【选中】shallow')||!txt.includes('pseudo-outlier augmentation'))throw new Error('broken prompt context');
  const images=first.messages.flatMap(m=>Array.isArray(m.content)?m.content.filter(p=>p.type==='image_url'):[]);
  if(first.model!=='deepseek-v4-flash-vision-exp'||images.length!==1)throw new Error('vision request missing');
  const metrics=await page.evaluate(async url=>{
    const image=new Image();image.src=url;await image.decode();
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    c.getContext('2d').drawImage(image,0,0);
    const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let ink=0;for(let i=0;i<data.length;i+=4)if(data[i]<200||data[i+1]<200||data[i+2]<200)ink++;
    return {width:c.width,height:c.height,inkPixels:ink};
  },images[0].image_url.url);
  if(metrics.inkPixels<10000)throw new Error('blank PDF visual input');
  await page.screenshot({path:'work/reader-verified.png'});
  await select('detec-','tion (AD).','detection (AD).');
  await page.waitForTimeout(1200);
  if(!requests.at(-1).messages[1].content.includes('【选中】detection (AD).'))throw new Error('cross-line selection not normalized');
  await page.getByPlaceholder('接着问点什么').fill('这里的表示能力是什么？');
  await page.getByPlaceholder('接着问点什么').press('Enter');
  await page.waitForTimeout(800);
  const followup=requests.at(-1);
  if(followup.messages.at(-1).content!=='这里的表示能力是什么？')throw new Error('followup missing');
  if(!followup.messages.some(m=>m.role==='assistant'))throw new Error('prior answer missing');
  await select('symmetrical',null,'symmetrical');
  await page.waitForTimeout(2000);
  const later=requests.at(-1);
  const laterImages=later.messages.flatMap(m=>Array.isArray(m.content)?m.content.filter(p=>p.type==='image_url'):[]);
  if(laterImages.length!==3)throw new Error('earlier figure pages missing: '+laterImages.length);
  await select('Multires-',null,'Multires-');
  await page.waitForTimeout(1000);
  const captionRequest=requests.at(-1).messages[1].content;
  if(captionRequest.includes('3. Our Approach'))throw new Error('caption selection leaked later chapters into context');
  await page.locator('input[type=file]').setInputFiles('C:/Users/about/Downloads/2201.10703v2.pdf');
  await page.waitForFunction(()=>document.querySelectorAll('.pv-page').length===10);
  return {passed:true,requestCount:requests.length,model:first.model,images:images.length,
    image:metrics,requestBytes:JSON.stringify(first).length,selected:'shallow',crossLine:'detection (AD).',
    followup:true,laterPageImages:laterImages.length,captionBounded:true,reloadPages:10};
}
