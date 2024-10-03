const express = require("express");
const router = express.Router();
const amqp = require('amqplib');
const axios = require('axios')
const queueName = 'api_queue';
const rabbitMQURL = process.env.RABBIT_MQURL || 'amqp://localhost'; // Update with your RabbitMQ URL
const ErrorLog = require("../../models/errorLog")
const { inspect } = require('util');

const { ObjectId } = require('mongodb');

// Route send payload to queue
router.post('/', async (req, res) => {
    try {
        const payloadArray = req.body;
        const headers = req.headers;
        // console.log("headers :", headers)
        const { application } = req.query
        console.log("applicationName:", application)
        await processPayloadArray(payloadArray, headers, application);
        res.status(200).json({ message: 'Payloads sent to the queue' });
    } catch (error) {
        return res.status(500).json({
            message: "Internal server error",
            error: error.message,

        });
    }
});
const saveResponseToDb = async (response, payload, headers, currentDate, application, request_status, response_type, ack_trigger_time, ack_response_type, ack_response) => {
    try {
        // Sanitize the response object to remove circular references
        const sanitizedResponse = inspect(response, { depth: null });

        // Create the error log data object
        const newErrorLogData = {
            request_received_from: application,
            received_time: currentDate,
            send_url: payload.send_url,
            payload: payload,
            method: payload.method,
            headers: headers,
            ack_url: payload.ack_url,
            request_status: request_status,
            api_response: sanitizedResponse, // Use the sanitized response
            trigger_instances: [
                {
                    trigger_time: currentDate,
                    response_type: response_type,
                    response: sanitizedResponse,
                },
            ],
            response_type: response_type,
            ack_trigger_time: ack_trigger_time,
            ack_response_type: ack_response_type,
            ack_response: ack_response,
        };

        // Serialize the object to JSON
        const serializedData = JSON.stringify(newErrorLogData);

        // Check if an error log with the same payload.uniqueId exists
        const existingErrorLog = await ErrorLog.findOne({ 'payload.uniqueId': payload.uniqueId });

        if (existingErrorLog) {
            // Update trigger_instances and other fields in the existing entry
            existingErrorLog.trigger_instances.push({
                trigger_time: currentDate,
                response_type: response_type,
                response: sanitizedResponse,
            });

            existingErrorLog.request_status = request_status;
            existingErrorLog.api_response = sanitizedResponse;
            existingErrorLog.response_type = response_type;

            // Save the updated entry
            const updatedErrorLog = await existingErrorLog.save();

            return updatedErrorLog;
        } else {
            // Create a new ErrorLog document and save it
            const newErrorLog = new ErrorLog(JSON.parse(serializedData)); // Parse the serialized data back to an object

            const savedErrorLog = await newErrorLog.save();

            return savedErrorLog;
        }
    } catch (error) {
        console.error("Error saving ErrorLog:", error);
        throw error;
    }
};


// Function to send payload to RabbitMQ queue
async function sendToQueue(payload) {
    try {
        console.log(rabbitMQURL)
        const connection = await amqp.connect(rabbitMQURL);
        const channel = await connection.createChannel();
        console.log("connected")
        await channel.assertQueue(queueName, { durable: false });
        await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)));
        console.log('Payload sent to the queue:', payload);
        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Error sending payload to the queue:', error);
        throw error;
    }
}

// Function to process the payload array
async function processPayloadArray(payloadArray, headers, application) {
    try {
        for (const payload of payloadArray) {
            const uniqueId = new ObjectId();
            payload.uniqueId = uniqueId.toString();
            await sendToQueue(payload);
            await consumeQueue(headers, application);
        }
    } catch (error) {
        console.error('Error processing payload array:', error);
        throw error;
    }
}

// Constants for retry settings
const maxRetryAttempts = 5;
const retryDelayMs = 15 * 60 * 1000; // Retry delay in milliseconds (15 minutes)

// Consumer worker to process the queue
async function consumeQueue(headers, application) {
    try {
        const connection = await amqp.connect(rabbitMQURL);
        const channel = await connection.createChannel();
        await channel.assertQueue(queueName, { durable: false });

        channel.prefetch(1);

        console.log('Waiting for messages from the queue...');

        channel.consume(queueName, async (message) => {
            const payload = JSON.parse(message.content.toString());

            // Process the payload (make the API call, etc.)
            try {
                const success = await apiCalling(payload, headers, application);
                if (success === true) {
                    channel.ack(message);
                    console.log('Payload processed and acknowledged:', payload);
                } else {
                    // API call failed. Check if retry attempts are left.
                    const retryCount = message.properties.headers['x-retry-count'] || 0;
                    if (retryCount < maxRetryAttempts) {
                        // Increment retry count and re-publish the message to the queue with a delay.
                        const retryHeaders = {
                            ...message.properties.headers,
                            'x-retry-count': retryCount + 1,
                        };
                        setTimeout(() => {
                            channel.sendToQueue(queueName, message.content, { headers: retryHeaders });
                            console.log(`Retry #${retryCount + 1}: Payload re-queued for retrying.`, payload);
                            channel.ack(message); // Acknowledge the original message to avoid duplicate processing.
                        }, retryDelayMs);
                    } else {
                        console.log(`Max retry attempts reached. Payload not processed:`, payload);
                        channel.ack(message); // Acknowledge the message to remove it from the queue.
                    }
                }
            } catch (error) {
                console.error('Error apiCalling:', error);
                // Handle non-retryable errors here. For example, you can log the error or discard the message.
                // channel.ack(message);
            }
        });
    } catch (error) {
        console.error('Error consuming queue:', error);
        throw error;
    }
}


// Function to process the payload (make the API call)
async function apiCalling(payload, headers, application) {
    console.log("headers:", application)
    console.log(payload.send_url)
    let ack_trigger_time
    let ack_response_type
    let ack_response
    let success = true
    let config = {
        method: payload.method,
        maxBodyLength: Infinity,
        url: payload.send_url,
        data: payload.payload
    };

    // Check if 'headers' has a value and add it to 'config' if it does
    if (payload.headers) {
        console.log("inside headers", payload.headers)
        config.headers = payload.headers;
    }

    await axios.request(config)
        .then(async (response) => {
            console.log("Working fine")
            if (payload.ack_url) {

                const callbackUrl = payload.ack_url;
                console.log(response.status);

                const ack_url_payload = {
                    method: payload.method,
                    url: payload.send_url,
                    payload: {
                        response_status: "success",
                        response_data: response.data
                    },
                    statusCode: response.status,
                };

                await axios.post(callbackUrl, ack_url_payload)
                    .then(async (ack_url_response) => {
                        console.log('Callback request successful');
                        // Handle the response from the callback URL
                        // console.log(response.data);
                        // ack_trigger_time = await new Date()
                        // ack_response_type = await 'success'
                        // ack_response = await response.data
                        console.log("ack_url_payload:: ", ack_url_payload)
                        success = true
                        // Create a response object for the callback

                        ack_trigger_time = await new Date()
                        ack_response_type = await 'success'
                        ack_response = await ack_url_response.data
                        // Create a response object for the callback
                        console.log("sucess", ack_url_payload)

                        const currentDate = new Date();
                        const request_status = 'accepted'
                        const response_type = 'success'
                        await saveResponseToDb(response.data, payload, headers, currentDate, application, request_status, response_type, ack_trigger_time, ack_response_type, ack_response)

                    })
                    .catch(async (ack_url_response) => {
                        console.log('Working fine but Error making callback request:', ack_url_response);
                        console.log('Start');
                        success = false

                        ack_trigger_time = await new Date()
                        ack_response_type = await 'error'
                        // ack_response = await error.response.data
                        if (ack_url_response.response && ack_url_response.response.data) {
                            ack_response = ack_url_response.response.data;
                        } else if (ack_url_response.response) {
                            ack_response = ack_url_response.response;
                        } else {
                            ack_response = ack_url_response;
                        }
                        // success = false
                        // Create a response object for the callback
                        console.log("failed", ack_url_payload)

                        const currentDate = new Date();
                        const request_status = 'accepted'
                        const response_type = 'success'
                        console.log('END');
                        await saveResponseToDb(response.data, payload, headers, currentDate, application, request_status, response_type, ack_trigger_time, ack_response_type, ack_response)

                    });
            } else {

                const currentDate = new Date();
                const request_status = 'accepted'
                const response_type = 'success'
                await saveResponseToDb(response.data, payload, headers, currentDate, application, request_status, response_type, ack_trigger_time, ack_response_type, ack_response)
            }

        })
        .catch(async (error) => {
            console.log("Not Working")
            if (payload.ack_url) {

                const callbackUrl = payload.ack_url;
                console.log(error.response?.status);

                const ack_url_payload = {
                    method: payload.method,
                    url: payload.send_url,
                    payload: {
                        response_status: "failed",
                        response_data: error.response?.data
                    },
                    statusCode: error.response?.status,
                };

                console.log("failed", ack_url_payload)


                await axios.post(callbackUrl, ack_url_payload)
                    .then(async (ack_url_response) => {
                        console.log('Callback request successful');
                        // Handle the response from the callback URL
                        // console.log(response.data);
                        ack_trigger_time = await new Date()
                        ack_response_type = await 'success'
                        ack_response = await ack_url_response.data
                        success = false
                        // Create a response object for the callback
                        console.log("failed", ack_url_payload)

                        const currentDate = new Date();
                        const request_status = 'rejected'
                        const response_type = 'error'
                        await saveResponseToDb(error.response?.data, payload, headers, currentDate, application, request_status, response_type, ack_trigger_time, ack_response_type, ack_response)

                    })
                    .catch(async (ack_url_response) => {
                        console.log('Not Working fine and Error making callback request:', ack_url_response);
                        console.log('Start');

                        ack_trigger_time = await new Date()
                        ack_response_type = await 'error'
                        // ack_response = await error.response.data
                        if (ack_url_response?.response && ack_url_response?.response?.data) {
                            ack_response = ack_url_response?.response?.data;
                        } else if (ack_url_response.response) {
                            ack_response = ack_url_response.response;
                        } else {
                            ack_response = ack_url_response;
                        }
                        // success = false
                        // Create a response object for the callback
                        console.log("failed", ack_url_payload)

                        const currentDate = new Date();
                        const request_status = 'rejected'
                        const response_type = 'error'
                        await saveResponseToDb(error.response?.data, payload, headers, currentDate, application, request_status, response_type, ack_trigger_time, ack_response_type, ack_response)
                        console.log('END');
                        // success = false



                    });
            } else {
                const currentDate = new Date();
                const request_status = 'rejected'
                const response_type = 'error'
                await saveResponseToDb(error.response?.data, payload, headers, currentDate, application, request_status, response_type, ack_trigger_time, ack_response_type, ack_response)
                // success = false

            }

            success = false

        });


    console.log("Final sucess: ", success)
    return success
}




module.exports = router;
