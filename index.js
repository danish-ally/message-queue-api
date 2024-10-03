const express = require('express');
const app = express();
require('dotenv').config();
const routes = require("./routes");
const cors = require("cors");
const swaggerUI = require("swagger-ui-express");
const YAML = require("yamljs");
const swaggerJSDocs = YAML.load("./api.yaml");
const mongoose = require('mongoose');
const Sentry = require("@sentry/node");
const { ProfilingIntegration } = require("@sentry/profiling-node");


Sentry.init({
    dsn: "https://3812b520f9436b34c1749724db6091a3@o4504361382969346.ingest.sentry.io/4506415455207424",
    integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Sentry.Integrations.Express({ app }),
        new ProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
});

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());



// const DB = `mongodb://${encodeURIComponent('root')}:${encodeURIComponent('DM7kht6kUg1lvQYpsiZ2')}@localhost:27020`;
// Connect to MongoDB
mongoose.connect(process.env.DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
    });


// Middleware to parse JSON in the request body
app.use(express.json());
app.use(cors());
app.use(routes);
// Swagger
app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerJSDocs));

app.post('/', async (req, res) => {
    try {
        res.status(200).json({ message: 'CallBack URL called successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get("/debug-sentry", function mainHandler(req, res) {
    throw new Error("My first Sentry error Danish!");
});

const port = process.env.PORT || 3000;


// The error handler must be registered before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
    // The error id is attached to `res.sentry` to be returned
    // and optionally displayed to the user for support.
    res.statusCode = 500;
    res.end(res.sentry + "\n");
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log("You can have Api docs from here ➡️  http://localhost:3000/api-docs/ and after clicking on this link select HTTP")
});
