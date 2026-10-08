const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const ordersFile = path.join(__dirname, 'orders.json');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(__dirname));

function clean(v, max=1000){ return String(v ?? '').trim().slice(0,max); }
function escapeTelegram(v){ return clean(v).replace(/[\\\[\]*_`]/g, '\\$&'); }
function nextOrderId(){
  let data=[];
  try { data=JSON.parse(fs.readFileSync(ordersFile,'utf8')); } catch {}
  const id=(data.length ? Math.max(...data.map(x=>Number(x.id)||0)) : 1000)+1;
  return {id,data};
}

app.post('/api/order', async (req,res)=>{
  try {
    const b=req.body||{};
    const name=clean(b.name,120), phone=clean(b.phone,50), email=clean(b.email,160);
    const contactType=clean(b.contactType,20), contactValue=clean(b.contactValue,150);
    const delivery=clean(b.delivery,120), address=clean(b.address,1000);
    const items=Array.isArray(b.items)?b.items.slice(0,50).map(x=>({name:clean(x.name,200),qty:Math.max(1,Math.min(999,Number(x.qty)||1)),price:Number(x.price)||0,sum:Number(x.sum)||0})):[];
    const total=Number(b.total)||items.reduce((s,x)=>s+x.sum,0);
    if(!name || !phone || !items.length) return res.status(400).json({error:'Заполните имя, телефон и выберите подарок.'});
    if(!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(phone)) return res.status(400).json({error:'Введите телефон в формате +7 (___) ___-__-__.'});
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Проверьте email.'});
    if(!['telegram','max'].includes(contactType) || !contactValue) return res.status(400).json({error:'Выберите Telegram или MAX и укажите контакт.'});
    if(!BOT_TOKEN || !ADMIN_CHAT_ID) return res.status(503).json({error:'Telegram пока не настроен на сервере.'});

    const {id,data}=nextOrderId();
    const order={id,createdAt:new Date().toISOString(),name,phone,email,contactType,contactValue,delivery,address,items,total};
    data.push(order);
    fs.writeFileSync(ordersFile, JSON.stringify(data,null,2));

    const itemText=items.map(x=>`• ${escapeTelegram(x.name)} × ${x.qty} — ${(x.sum).toLocaleString('ru-RU')} ₽`).join('\n');
    const text=[
      `🆕 НОВАЯ ЗАЯВКА №${id}`,
      '',
      `👤 ${escapeTelegram(name)}`,
      `📞 ${escapeTelegram(phone)}`,
      `${contactType==='telegram' ? '✈️ Telegram' : '💬 MAX'}: ${escapeTelegram(contactValue)}`,
      email ? `📧 Email: ${escapeTelegram(email)}` : '',
      '',
      `🚚 ${escapeTelegram(delivery)}`,
      address ? `📍 ${escapeTelegram(address)}` : '',
      '',
      '🎁 ПОДАРКИ:',
      itemText,
      '',
      `💰 Предварительная сумма: ${total.toLocaleString('ru-RU')} ₽`,
      '',
      'ℹ️ Это заявка на согласование, не оплаченный заказ.'
    ].filter(Boolean).join('\n');

    const tg=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:ADMIN_CHAT_ID,text})
    });
    const tgJson=await tg.json().catch(()=>({}));
    if(!tg.ok || !tgJson.ok){
      return res.status(502).json({error:'Заявка сохранена, но Telegram не принял сообщение. Проверьте настройки бота.'});
    }
    res.json({ok:true,orderId:id});
  } catch(e){
    console.error(e);
    res.status(500).json({error:'Внутренняя ошибка сервера.'});
  }
});

app.get('/health',(req,res)=>res.json({ok:true}));
app.listen(PORT,()=>console.log(`Сладкий Новый год: http://localhost:${PORT}`));
