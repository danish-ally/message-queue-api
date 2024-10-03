const express = require("express");
const router = express.Router();
const ErrorLog = require("../../models/errorLog");

router.get("/", async (req, res) => {
  try {
    const {
      request_received_from,
      start_date,
      end_date,
      send_url,
      ack_url,
      response_type,
      ack_response_type,
      page,
      perPage,
      search,
    } = req.query;

    let query = {};

    if (request_received_from) {
      query.request_received_from = request_received_from;
    }

    if (start_date && end_date) {
      if (start_date === end_date) {
        // Filter for a specific date range when start_date and end_date are the same
        const startDate = new Date(start_date);
        startDate.setUTCHours(0, 0, 0, 0); // Set start time to 00:00:00.000 UTC
        const endDate = new Date(end_date);
        endDate.setUTCHours(23, 59, 59, 999); // Set end time to 23:59:59.999 UTC
        query.createdAt = {
          $gte: startDate,
          $lte: endDate,
        };
      } else {
        query.createdAt = {
          $gte: new Date(start_date),
          $lte: new Date(end_date + "T23:59:59.999Z"),
        };
      }
    } else if (start_date) {
      query.createdAt = {
        $gte: new Date(start_date),
      };
    } else if (end_date) {
      query.createdAt = {
        $lte: new Date(end_date + "T23:59:59.999Z"),
      };
    }

    if (send_url) {
      query.send_url = send_url;
    }

    if (ack_url) {
      query.ack_url = ack_url;
    }

    if (response_type) {
      query.response_type = response_type;
    }

    if (ack_response_type) {
      query.ack_response_type = ack_response_type;
    }

    if (search) {
      query.$or = [
        { request_received_from: { $regex: search, $options: "i" } },
        { send_url: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * perPage;
    const limit = parseInt(perPage);

    const totalLogs = await ErrorLog.countDocuments(query);

    const errorlogs = await ErrorLog.find(query)
      .sort({ createdAt: -1 }) // Sort in descending order of creat
      .skip(skip)
      .limit(limit);

    const responseObj = {
      totalLogs,
      currentPage: page,
      perPage: limit,
      logs: errorlogs,
    };

    res.json(responseObj);
  } catch (err) {
    return res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
});








router.post("/", async (req, res) => {
  const errorLogData = req.body;

  // Store the log entry in the database
  ErrorLog.create(errorLogData)
    .then(() => {
      res.status(201).json({ message: 'ErrorLog created successfully' });
    })
    .catch((error) => {
      res.status(500).json({ message: 'Failed to create errorLog entry', error });
    });
})


module.exports = router;
