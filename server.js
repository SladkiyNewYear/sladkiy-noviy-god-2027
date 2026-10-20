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
    const delivery=clean(b.delivery,120), city=clean(b.city,120), address=clean(b.address,1000);
    const catalog={1:{name:'Новогодние каникулы',price:215},2:{name:'Смартфон',price:320},3:{name:'Кучеряшки',price:445},4:{name:'Лисята',price:485},5:{name:'Снежные забавы',price:595},6:{name:'Добрые друзья',price:680},7:{name:'Весёлая овечка',price:790},8:{name:'Милые барашки',price:935},9:{name:'Стиляги',price:1120},10:{name:'Рыжик',price:1295}};
    const rawItems=Array.isArray(b.items)?b.items.slice(0,50):[];
    const items=rawItems.map(x=>{const id=Number(x.id), product=catalog[id], qty=Number(x.qty); if(!product || !Number.isInteger(qty) || qty<1 || qty>999) return null; return {id,name:product.name,qty,price:product.price,sum:product.price*qty};});
    if(!name || !phone || !email || !city || !address || !items.length || items.some(x=>!x)) return res.status(400).json({error:'Заполните обязательные поля и выберите подарки.'});
    if(!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(phone)) return res.status(400).json({error:'Введите телефон в формате +7 (___) ___-__-__.'});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Введите корректный email.'});
    const total=items.reduce((sum,x)=>sum+x.sum,0);
    if(total<2000) return res.status(400).json({error:'Минимальная сумма заказа — 2 000 рублей.'});
    if(!['telegram','max'].includes(contactType) || !contactValue) return res.status(400).json({error:'Выберите Telegram или MAX и укажите контакт.'});
    if(!BOT_TOKEN || !ADMIN_CHAT_ID) return res.status(503).json({error:'Telegram пока не настроен на сервере.'});

    const {id,data}=nextOrderId();
    const order={id,createdAt:new Date().toISOString(),name,phone,email,contactType,contactValue,delivery,city,address,items,total};
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
