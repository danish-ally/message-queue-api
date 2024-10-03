const router = require("express").Router();
const errorLogRoutes = require("./errorLog");
const pushToQueue = require('./pushToQueue')
const tokenValidatorMiddleware = require('../../middleware/auth');


router.use("/errorLog", errorLogRoutes);
router.use("/pushToQueue", pushToQueue);


module.exports = router;
