const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const BOT_TOKEN = process.env.TOKEN;

let chatId;

let temp = '';
let count = 0;
const userInputs = {};

// Объект для хранения курсов и пороговых значений
let cryptoData = {
  BTC: { max: 50000, min: 40000 },
  ETH: { max: 2000, min: 2000 },
};

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Функция для получения курса криптовалюты
async function getCryptoPrice(symbol) {
  try {
    const response = await axios.get(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}&convert=USD`,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CMC_PRO_API_KEY': process.env.API,
        },
      },
    );
    return parseFloat(response.data.data[symbol].quote.USD.price.toFixed(1));
  } catch (error) {
    console.error('Error fetching crypto price:', error.message);
    return null;
  }
}

// Функция для проверки курсов и отправки уведомлений
async function checkCryptoPrices() {
  for (const [symbol, thresholds] of Object.entries(cryptoData)) {
    const price = await getCryptoPrice(symbol);
    if (price >= thresholds.max) {
      sendTelegramMessage(`${symbol} достиг границы максимума: $${price}`);
    } else if (price <= thresholds.min) {
      sendTelegramMessage(`${symbol} достиг границы минимума: $${price}`);
    }
  }
}

// Функция для отправки сообщения в Telegram
function sendTelegramMessage(message) {
  bot.sendMessage(chatId, message);
}

const start = () => {
  bot.on('message', async (msg) => {
    bot.setMyCommands([
      {
        command: '/start',
        description: 'Запустить бота',
      },
    ]);
    const text = msg.text;
    chatId = msg.chat.id;

    if (text === '/start') {
      await bot.sendMessage(chatId, 'Добро пожаловать', {
        reply_markup: {
          keyboard: [['Подписки']],
          resize_keyboard: true,
        },
      });
      setInterval(checkCryptoPrices, 60000); //Обновление курса раз в минуту
      return await bot.sendMessage(
        chatId,
        `Сейчас подключено отслеживание ${Object.keys(cryptoData).map(
          (el, index) => `${el}: (${Object.entries(Object.values(cryptoData)[index])})`,
        )}`,
        {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                {
                  text: 'Изменить',
                  callback_data: 'change',
                },
              ],
            ],
          }),
        },
      );
    } else if (userInputs[chatId] && userInputs[chatId].waitingForCryptoName) {
      count += 1;
      if (count === 1) {
        cryptoData[temp] = { min: text };
        await bot.sendMessage(chatId, 'При каком максимуме оповещать?');
      } else {
        cryptoData[temp] = { min: cryptoData[temp].min, max: text };
        count = 0;
        userInputs[chatId].waitingForCryptoName = false;
        await bot.sendMessage(chatId, 'Готово');
      }
    } else if (text === 'Подписки') {
      return await bot.sendMessage(
        chatId,
        `Сейчас подключено отслеживание ${Object.keys(cryptoData).map(
          (el, index) => `${el}: (${Object.entries(Object.values(cryptoData)[index])})`,
        )}`,
        {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                {
                  text: 'Изменить',
                  callback_data: 'change',
                },
              ],
            ],
          }),
        },
      );
    } else {
      return await bot.sendMessage(chatId, 'Я тебя не понял');
    }
  });
};

start();

const addCrypto = async (coin) => {
  if (Object.keys(cryptoData).includes(coin)) {
    const updatedCryptoData = Object.keys(cryptoData).reduce((acc, key) => {
      if (key !== coin) {
        acc[key] = cryptoData[key];
      }
      return acc;
    }, {});
    cryptoData = updatedCryptoData;
    return await bot.sendMessage(chatId, `Вы отписались от отслеживания ${coin}`);
  } else {
    userInputs[chatId] = { waitingForCryptoName: true };
    temp = coin;
    return await bot.sendMessage(chatId, 'При каком минимуме оповещать?');
  }
};

bot.on('callback_query', async (msg) => {
  const text = msg.data;
  const messageId = msg.message.message_id;
  switch (text) {
    case 'change':
      await bot.sendMessage(chatId, 'Выберите криптовалюту, которую хотите отслеживать', {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { text: 'Bitcoin (BTC)', callback_data: 'btc' },
              { text: 'Litecoin (LTC)', callback_data: 'ltc' },
            ],
            [
              { text: 'Ethereum (ETH)', callback_data: 'eth' },
              { text: 'Dogecoin (DOGE)', callback_data: 'doge' },
            ],
          ],
        }),
      });
      break;
    case 'btc':
      addCrypto('BTC');
      await bot.deleteMessage(chatId, messageId);
      break;
    case 'ltc':
      addCrypto('LTC');
      break;
    case 'doge':
      addCrypto('DOGE');
      break;
    case 'eth':
      addCrypto('ETH');
      break;
  }
});
