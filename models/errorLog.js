const mongoose = require('mongoose');


const errorLogSchema = new mongoose.Schema({

    request_received_from: {
        type: String,
        enum: ['lawsikho', 'mlapp', 'skillarbitra', 'payment-system'],
        required: true,
    },
    received_time: { type: Date, required: true },
    send_url: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        required: true,
    },
    headers: { type: mongoose.Schema.Types.Mixed },
    ack_url: { type: String },
    request_status: {
        type: String,
        enum: ['rejected', 'accepted'],
        required: true,
    },
    api_response: { type: Object },
    trigger_instances: [
        {
            trigger_time: { type: Date, required: true },
            response_type: {
                type: String,
                enum: ['success', 'error'],
                required: true,
            },
            response: { type: mongoose.Schema.Types.Mixed },
        },
    ],
    response_type: {
        type: String,
        enum: ['success', 'error'],
    },
    ack_trigger_time: { type: Date },
    ack_response_type: {
        type: String,
        enum: ['success', 'error'],
    },
    ack_response: { type: mongoose.Schema.Types.Mixed },

},

    {
        timestamps: true,
    }
);

const ErrorLog = mongoose.model('errorLog', errorLogSchema);

module.exports = ErrorLog;