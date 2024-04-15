/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require("express");
var bodyParser = require("body-parser");
var passport = require("passport");
var authController = require("./auth");
var authJwtController = require("./auth_jwt");
var jwt = require("jsonwebtoken");
var cors = require("cors");
var User = require("./Users");
var Movie = require("./Movies");
var Review = require("./Reviews");
const mongoose = require("mongoose");


var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

function getJSONObjectForMovieRequirement(req) {
  var json = {
    headers: "No headers",
    key: process.env.UNIQUE_KEY,
    body: "No body",
  };

  if (req.body != null) {
    json.body = req.body;
  }

  if (req.headers != null) {
    json.headers = req.headers;
  }

  return json;
}

router.post("/signup", function (req, res) {
  if (!req.body.username || !req.body.password) {
    res.json({
      success: false,
      msg: "Please include both username and password to signup.",
    });
  } else {
    var user = new User();
    user.name = req.body.name;
    user.username = req.body.username;
    user.password = req.body.password;

    user.save(function (err) {
      if (err) {
        if (err.code == 11000)
          return res.json({
            success: false,
            message: "A user with that username already exists.",
          });
        else return res.json(err);
      }

      res.json({ success: true, msg: "Successfully created new user." });
    });
  }
});

router.post("/signin", function (req, res) {
  var userNew = new User();
  userNew.username = req.body.username;
  userNew.password = req.body.password;

  User.findOne({ username: userNew.username })
    .select("name username password")
    .exec(function (err, user) {
      if (err) {
        res.send(err);
      }

      user.comparePassword(userNew.password, function (isMatch) {
        if (isMatch) {
          var userToken = { id: user.id, username: user.username };
          var token = jwt.sign(userToken, process.env.SECRET_KEY);
          res.json({ success: true, token: "JWT " + token });
        } else {
          res
            .status(401)
            .send({ success: false, msg: "Authentication failed." });
        }
      });
    });
});

router
  .route("/movies")
  .get(authJwtController.isAuthenticated, (req, res) => {
    const { reviews } = req.query;
    if (reviews === 'true') {
        const aggregate = [
            {
                $lookup: {
                    from: 'reviews',
                    localField: '_id',
                    foreignField: 'movieId',
                    as: 'movieReviews'
                }
            },
            {
                $addFields: {
                    avgRating: { $avg: '$movieReviews.rating' }
                }
            },
            {
                $sort: { avgRating: -1 }
            }
        ];
        Movie.aggregate(aggregate).exec((err, movies) => {
            if (err) {
                res.status(400).send(err);
            } else {
                res.status(200).json(movies);
            }
        });
    } else {
        Movie.find(
            {
                title: { $exists: true, $ne: null },
                releaseDate: { $exists: true, $ne: null },
                genre: { $exists: true, $ne: null },
                actors: { $exists: true, $ne: null },
            },
            (err, movies) => {
                if (err) {
                    res.status(400).send(err);
                } else {
                    res.status(200).json(movies);
                }
            }
        );
    }
})

  .post(authJwtController.isAuthenticated, (req, res) => {
    const { title, releaseDate, genre, actors } = req.body;

    if (!title || !releaseDate || !genre || !actors || actors.length === 0) {
      return res.status(400).json({
        error:
          "Title, release date, genre, and at least one actor (actor name and character name) are required",
      });
    }

    try {
      const movie = new Movie({ title, releaseDate, genre, actors });
      movie.save();
      res.status(200).json(movie);
    } catch (error) {
      console.error("Error creating movie:", error);
      res.status(500).json({ error: "Failed to create movie" });
    }
  });

// router.route('/movies/:id')
//     .delete((req, res) => {
//         const movieId = req.params.id;

//         // Find the movie by id and delete it
//         Movie.findByIdAndDelete(movieId, (err, deletedMovie) => {
//             if (err) {
//                 console.error('Error deleting movie:', err);
//                 return res.status(500).json({ error: 'Failed to delete movie' });
//             }

//             if (!deletedMovie) {
//                 return res.status(404).json({ error: 'Movie not found' });
//             }

//             res.status(200).json({ message: 'Movie deleted successfully', deletedMovie });
//         });
//     });

router
  .route("/movies/:title")
  //   .get((req, res) => {
  //     const movieTitle = req.params.title;
  //     Movie.find({ title: movieTitle }, (err, movie) => {
  //       if (err) {
  //         res.status(400).send(err);
  //       } else if (movie.length === 0) {
  //         res.status(404).json({ error: "Movie not found" });
  //       } else {
  //         res.status(200).json(movie);
  //       }
  //     });
  //   })

  .put(authJwtController.isAuthenticated, (req, res) => {
    const currentTitle = req.params.title;
    const newTitle = req.body.title;

    // Find the movie by current title and update its title
    Movie.findOneAndUpdate(
      { title: currentTitle },
      { title: newTitle },
      { new: true },
      (err, updatedMovie) => {
        if (err) {
          res.status(400).send(err);
        } else if (!updatedMovie) {
          res.status(404).json({ error: "Movie not found" });
        } else {
          res.status(200).json(updatedMovie);
        }
      }
    );
  })

  .delete(authJwtController.isAuthenticated, (req, res) => {
    const movieTitle = req.params.title;

    Movie.findOneAndDelete({ title: movieTitle }, (err, deletedMovie) => {
      if (err) {
        console.error("Error deleting movie:", err);
        return res.status(500).json({ error: "Failed to delete movie" });
      }

      if (!deletedMovie) {
        return res.status(404).json({ error: "Movie not found" });
      }

      res
        .status(200)
        .json({ message: "Movie deleted successfully", deletedMovie });
    });
  });

router
  .route("/reviews")
  .get(authJwtController.isAuthenticated, (req, res) => {
    Review.find(
      {
        movieId: { $exists: true, $ne: null },
      },
      (err, reviews) => {
        if (err) {
          console.error("Error retrieving reviews:", err);
          res.status(400).send(err);
        } else {
          if (reviews.length === 0) {
            res.status(404).json({ message: "No reviews found" });
          } else {
            res
              .status(200)
              .json({ message: "Reviews retrieved successfully", reviews });
          }
        }
      }
    );
  })

  .post(authJwtController.isAuthenticated, async (req, res) => {
    const { movieId, username, review, rating } = req.body;

    try {
        const movie = await Movie.findById(movieId);
        if (!movie) {
            return res.status(404).json({ error: "Movie not found" });
        }
        else {
            const newReview = new Review({ movieId, username, review, rating });
            newReview.save();
            res.status(200).json({ message: "Review created!" });
        }
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ error: "Failed to create review" });
    }
  });

router.route("/movies/:id").get((req, res) => {
  const movieId = req.params.id;
  const { reviews } = req.query;
  Movie.find({ _id: movieId }, (err, movie) => {
    if (err) {
      res.status(400).send(err);
    } else if (movie.length === 0) {
      res.status(404).json({ error: "Movie not found" });
    } else if (reviews === "true") {
      const aggregate = [
        {
          $match: { _id: movieId }
        },
        {
          $lookup: {
            from: 'reviews',
            localField: '_id',
            foreignField: 'movieId',
            as: 'movieReviews'
          }
        },
        {
          $addFields: {
            avgRating: { $avg: '$movieReviews.rating' }
          }
        }
      ];
      Movie.aggregate(aggregate).exec(function (err, result) {
        if (err) {
          res.status(404).json({ error: "Reviews not found" });
        } else {
            res.status(200).json(result);
        }
      });
    } else {
      res.status(200).json(movie);
    }
  });
});

app.use("/", router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only
