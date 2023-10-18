require("dotenv").config();
const colors = require("ansi-colors");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: true,
});

bot.onText(/\/start/, (msg) => {
  let html = ``;

  citiesMap.forEach((city, key) => {
    html += `/w${key} ---> <b>${city}</b>\n`;
  });

  bot.sendMessage(msg.chat.id, `выберите имя города\n${html}`, {
    parse_mode: "HTML",
  });

});

bot.onText(/\/w(.+)/, async (msg, [source, match]) => {
  const explode = exploder(source);
  const getCity = getCode(explode);
  const asnwer = await getCityStatus(getCity);
  bot.sendMessage(msg.chat.id, outData(asnwer));
});

const getCityStatus = async (city) => {
  const API = `${process.env.WEATHER_URL}${city}${process.env.WEATHER_TOKEN}`;
  try {
    const response = await fetch(API);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const jsonData = await response.json();
    return jsonData;
  } catch (err) {
    return { cod: 404, message: "city not found" };
  }
};

const exploder = (source) => {
  return source.substr(2, source.length);
};

const outData = (data) => {
  if (data.cod == 404) {
    return `city not found`;
  }

  const { coord, weather, name, main, wind, clouds, sys } = data;

  return `
страна: ${sys.country}
город: ${name}
темп: ${main.temp}
ощущение: ${main.teels_like}
макс темп: ${main.temp_min}
мин темп: ${main.temp_max}
давление: ${main.pressure}
влажность: ${main.humidity}
ветер скорость: ${wind.speed}
ветер град: ${wind.deg}
описание: ${weather[0].main}
описание: ${weather[0].description}
облака: ${clouds.all}
координаты: ${coord.lon}, ${coord.lat},
список городов /start
`;
};

const citiesData = [
  ["ff11", "Tokyo"],
  ["ff12", "Delhi"],
  ["ff13", "Shanghai"],
  ["ff14", "Cairo"],
  ["ff15", "Mumbai"],
  ["ff16", "Beijing"],
  ["ff17", "Dhaka"],
  ["ff18", "Osaka"],
  ["ff19", "Karachi"],
];

const citiesMap = new Map(citiesData);

const getCode = (code) => {
  if (code == undefined) {
    return "city not found";
  } else {
    return citiesMap.get(code);
  }
};
