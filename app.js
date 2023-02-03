const express = require("express");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
var format = require("date-fns/format");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBandServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserExitsQuery = `
    select * from user where username = '${username}';
    `;
  const checkUserDetailsResponse = await db.get(checkUserExitsQuery);
  if (checkUserDetailsResponse === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `
            insert into user(username, password, name, gender)
             values('${username}','${hashedPassword}','${name}','${gender}');
                `;
      await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkLoginUserQuery = `
    select * from user where username = '${username}';
    `;
  const checkUserResponse = await db.get(checkLoginUserQuery);
  if (checkUserResponse === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(
      password,
      checkUserResponse.password
    );
    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//api-3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTwitsOfUsersQuery = `
    select T.username as username, tweet.tweet as tweet, tweet.date_time as dateTime from (user inner join follower on user.user_id = follower.following_user_id) as T 
    inner join tweet on  T.user_id = tweet.user_id 
    order by dateTime desc
    limit 4;
    `;
  const dbResponse = await db.all(getTwitsOfUsersQuery);
  response.send(dbResponse);
});

//api-4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getListOfFollowingOfUserQuery = `
    select user.username as name from user inner join follower on user.user_id = follower.follower_user_id
    where username = '${username}';
    `;
  const listOfFollowingResponse = await db.all(getListOfFollowingOfUserQuery);
  response.send(listOfFollowingResponse);
});

//api-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getListOfFollowersOfUserQuery = `
    select user.username as name from user inner join follower on user.user_id = follower.following_user_id
    where username = '${username}';`;
  const listOfFollowersResponse = await db.all(getListOfFollowersOfUserQuery);
  response.send(listOfFollowersResponse);
});

//api-6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserTweetsQuery = `
  select tweet.tweet_id from (user inner join follower on user.user_id = follower.following_user_id) as t 
  inner join tweet on t.follower_user_id = tweet.user_id;
  `;
  const tweetListResponseArray = await db.all(getUserTweetsQuery);
  const tweetIdsResponse = tweetListResponseArray.map((each) => {
    return each.tweet_id;
  });

  if (tweetIdsResponse.includes(parseInt(tweetId))) {
    const getTweetsOfUserFollowingQuery = `
  select t.tweet as tweet, count(t.like_id) as likes, count(reply.reply_id) as replies, t.date_time as dateTime  from (tweet inner join like on tweet.tweet_id ) as t
   inner join reply on t.tweet_id = reply.tweet_id where t.tweet_id = ${tweetId}
  `;

    const userFollowingTweetsResponse = await db.all(
      getTweetsOfUserFollowingQuery
    );
    response.send(userFollowingTweetsResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
//api-7-db
const convertLikedUserNameDBObjectToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};

//api-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserQuery = `
    select tweet.tweet_id from (user inner join follower on user.user_id = follower.follower_user_id) as t 
  inner join tweet on t.following_user_id = tweet.user_id;
    `;
    const getResponseArray = await db.all(getUserQuery);
    const tweetResponse = getResponseArray.map((each) => {
      return each.tweet_id;
    });
    if (tweetResponse.includes(parseInt(tweetId))) {
      const getLikesOfUserQuery = `
      select user.name from like inner join user 
      on user.user_id = like.user_id 
      where like.tweet_id = ${tweetId};
      `;
      const getLikesResponse = await db.all(getLikesOfUserQuery);
      const getLikedUserNames = getLikesResponse.map((eachUser) => {
        return eachUser.name;
      });
      console.log(getLikedUserNames);
      response.send(
        convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

const convertRepliesUserNameDBObjectToResponseObject = (dbObject) => {
  return { replies: dbObject };
};

//api-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserQuery = `
    select tweet.tweet_id from 
    (user inner join follower on user.user_id = follower.following_user_id) as t 
    inner join tweet on t.follower_user_id = tweet.user_id;
    `;
    const getResponseArray = await db.all(getUserQuery);
    const tweetResponse = getResponseArray.map((each) => {
      return each.tweet_id;
    });
    if (tweetResponse.includes(parseInt(tweetId))) {
      const getLikesOfUserQuery = `
      select user.name as name,reply.reply as reply from reply inner join user 
      on user.user_id = reply.user_id 
      where reply.tweet_id = ${tweetId};
      `;
      const getLikesResponse = await db.all(getLikesOfUserQuery);
      console.log(getLikesResponse);
      response.send(
        convertRepliesUserNameDBObjectToResponseObject(getLikesResponse)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//api-9
//mistake

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  console.log(getUserId);
  //get tweets made by user
  const getTweetIdsQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });
  response.send(getTweetIds);
});

//api-10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //console.log(getUserId.user_id);
  const { tweet } = request.body;
  //console.log(tweet);
  const currentDate = format(new Date(), "yyyy-MM-dd");
  // console.log(currentDate);

  const postRequestQuery = `
  insert
   into 
   tweet
   (tweet, user_id, date_time) 
   values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

  const responseResult = await db.run(postRequestQuery);

  response.send("Created a Tweet");
});

//api-11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);

    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
