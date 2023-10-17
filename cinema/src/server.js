require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

const geolib = require("geolib");
const _ = require("lodash");

const config = require("./config");
const { logStart, getChatId, getItemUuid, dd } = require("./helper");
const keyboard = require("./keyboard");
const kb = require("./keyboard-buttons");
const Film = require("./models/film.model");
const Cinema = require("./models/Cinema.model");
const User = require("./models/User.model");
const database = require("../database.json");

logStart();

const ACTION_TYPE = {
  TOGGLE_FAV_FILM: "tff",
  SHOW_CINEMAS: "sc",
  SHOW_CINEMAS_MAP: "scm",
  SHOW_FILMS: "sf",
};

const bot = new TelegramBot(config.TOKEN, {
  polling: true,
});

mongoose
  .connect(config.MONGO_DB)
  .then(() => {
    console.log("connected");
  })
  .catch((err) => {
    console.log(err);
  });

/*
database.cinemas.forEach((item) => {
  new Cinema(item).save();
})
*/

bot.on("message", (msg) => {
  const id = getChatId(msg);

  switch (msg.text) {
    case kb.home.favorite:
      showFavoriteFilms(id, msg.from.id);
      break;

    case kb.home.films:
      bot.sendMessage(id, `выберите жанр:`, {
        reply_markup: {
          keyboard: keyboard.films,
        },
      });
      break;

    case kb.film.comedy:
      sendFilmsByQuery(id, { type: "comedy" });
      break;

    case kb.film.action:
      sendFilmsByQuery(id, { type: "action" });
      break;

    case kb.film.random:
      sendFilmsByQuery(id, {});
      break;

    case kb.home.cinemas:
      const location = "40.377948, 49.891932";
      msg["location"] = location;

      bot.sendLocation(id, 40.377948, 49.891932);
      break;

    case kb.back:
      bot.sendMessage(id, `что хотите посмотреть?`, {
        reply_markup: {
          keyboard: keyboard.home,
        },
      });
      break;
  }

  if (msg?.location) {
    getCinemasInCoord(id, msg.location);
  }
});

//start
bot.onText(/\/start/, (msg) => {
  const text = `hello, ${msg.from.first_name}\nвыберите команду для начало работы:`;

  bot.sendMessage(getChatId(msg), text, {
    reply_markup: {
      keyboard: keyboard.home,
    },
  });
});

bot.onText(/\/f(.+)/, (msg, [source, match]) => {
  const filmUuid = getItemUuid(source);

  Promise.all([
    Film.findOne({ uuid: filmUuid }),
    User.findOne({ telegramId: msg.from.id }),
  ]).then(([film, user]) => {

    let isFav = false;
    
    if (user) {
      isFav = user.films.indexOf(film.uuid) !== -1;
    }
    
    const favText = isFav ? "удалить из избранного" : "добавить в избранное";
    
    const filmCaption = `названия фильма ${film.name}\nгод: ${film.year}\nрейтинг:${film.rate}\nдлительность:${film.length}\nстрана:${film.country}\n`;

    bot.sendPhoto(getChatId(msg), film.picture, {
      caption: filmCaption,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: favText,
              callback_data: JSON.stringify({
                type: ACTION_TYPE.TOGGLE_FAV_FILM,
                filmUuid: film.uuid,
                isFav: isFav,
              }),
            },
            {
              text: "показать кинотеатры",
              callback_data: JSON.stringify({
                type: ACTION_TYPE.SHOW_CINEMAS,
                cinemaUuids: film.cinemas,
              }),
            },
          ],
          [
            {
              text: `кинопоиск ${film.name}`,
              url: film.link,
            },
          ],
        ],
      },
    });

  });

});

bot.onText(/\/c(.+)/, (msg, [source, match]) => {
  const { id } = msg.chat;
  const cinemaUuid = getItemUuid(source);

  Cinema.findOne({ uuid: cinemaUuid }).then((cinema) => {
    bot.sendMessage(id, `msg.chat ${cinema.name}`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: cinema.name,
              url: cinema.url,
            },
            {
              text: "показать на карте",
              callback_data: JSON.stringify({
                type: ACTION_TYPE.SHOW_CINEMAS_MAP,
                lat: cinema.location.latitude,
                lon: cinema.location.longitude,
              }),
            },
          ],
          [
            {
              text: "показать фильмы",
              callback_data: JSON.stringify({
                type: ACTION_TYPE.SHOW_FILMS,
                filmUuids: cinema.films,
              }),
            },
          ],
        ],
      },
    });
  });
});

bot.on("callback_query", (query) => {
  try {
    const userId = query.from.id;
    let data;

    data = JSON.parse(query.data);
    const { type } = data;

    if (type === ACTION_TYPE.SHOW_CINEMAS_MAP) {
      const {lat, lon} = data;
      bot.sendLocation(query.message.chat.id, lat, lon)
    } else if (type === ACTION_TYPE.SHOW_CINEMAS) {
      sendCinemasByQuery(userId, {uuid: {'$in':data.cinemaUuids}});
    } else if (type === ACTION_TYPE.TOGGLE_FAV_FILM) {
      toggleFavoriteFilm(userId, query.id, data);
    } else if (type === ACTION_TYPE.SHOW_FILMS) {
      sendFilmsByQuery(userId,{uuid:{'$in': data.filmUuids}});
    }
  } catch (err) {
    throw new Error("data is not an object");
  }
});

bot.on('inline_query', query => {
  Film.find({}).then(films => {
    const results = films.map(f => {
      const filmCaption = `названия фильма ${f.name}\nгод: ${f.year}\nрейтинг:${f.rate}\nдлительность:${f.length}\nстрана:${f.country}\n`;

      return {
        id: f.uuid,
        type: 'photo',
        photo_url: f.picture,
        thumb_url: f.picture,
        caption: filmCaption,
        reply_markup:{
          inline_keyboard:[
            [
              {
                text: `кинопоиск ${f.name}`,
                url:f.link
              }
            ]
          ]
        }
      }
    });

    bot.answerInlineQuery(query.id, _.results, {
      cache_time:0 
    })
  })
});

// ! functions
const sendFilmsByQuery = (id, query) => {
  Film.find(query).then((films) => {
    const html = films
      .map((item, i) => {
        return `<b>${i + 1}</b>: ${item.name} - /f${item.uuid}`;
      })
      .join("\n");

    sendHTML(id, html, "films");
  });
};

const sendHTML = (id, html, kbName = null) => {
  const options = {
    parse_mode: "HTML",
  };

  if (kbName) {
    options["reply_markup"] = {
      keyboard: keyboard[kbName],
    };
  }

  bot.sendMessage(id, html, options);
};

const getCinemasInCoord = (id, location) => {
  Cinema.find({})
    .then((cinemas) => {
      cinemas.forEach((c) => {
        c.distance =
          Math.round(geolib.getDistance(location, c.location)) / 1000;
      });
      cinemas = _.sortBy(cinemas, "distance");

      const html = cinemas
        .map((cinema, i) => {
          return `<b>${i + 1}</b>: ${
            cinema.name
          } - <em>расстояние</em> - <strong>${cinema.distance} км, /c${
            cinema.uuid
          } </strong>`;
        })
        .join("\n");
      sendHTML(id, html, "home");
    })
    .catch((err) => {
      console.log(err);
    });
};

const toggleFavoriteFilm = (userId, queryId, { filmUuid, isFav }) => {
  let userPromise;

  User.findOne({ telegramId: userId }).then((user) => {
    if (user) {
      if (isFav) {
        user.films = user.films.filter((fUuid) => fUuid !== filmUuid);
      } else {
        user.films.push(filmUuid);
      }

      userPromise = user;
    } else {
      userPromise = new User({
        telegramId: userId,
        films: [filmUuid],
      });
    }

    const answerText = isFav ? "удалено" : "добавлено";

    userPromise
      .save()
      .then(_ => {
        bot.answerCallbackQuery({
          callback_query_id: queryId,
          text: answerText,
        });
      })
      .catch((err) => {
        console.log(err);
      });
  });
};

const showFavoriteFilms = (chatId, telegramId) => {
  User.findOne({telegramId})
  .then(user => {

    let html;

    if(user){
        Film.find({uuid: {'$in':user.films}}).then(films => {

          if(films.length > 0){
            html = films.map((f, i) => {
              return `<b>${i+1}</b> ${f.name} - <b>${f.rate}</b> (f/${f.uuid})`;
            }).join('\n')
          }else{
            html = 'вы пока ничего не добавили'
          }
          sendHTML(chatId, html, 'home');
        }).catch((err) => {
          console.log(err);
        })
    } else {
      sendHTML(chatId, 'вы пока ничего не добавили', 'home');
    }  
  }).catch((err) => {
    console.log(err);
  })
}

const sendCinemasByQuery = (userId, query) => {
  Cinema.find(query).then(cinemas => {
    const html = cinemas.map((c, i) => {
      return `<b>${i + 1}</b> ${c.name} /c${c.uuid}`;
    }).join('\n');

    sendHTML(userId, html, 'home');
  }) 
}