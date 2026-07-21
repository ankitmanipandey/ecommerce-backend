const express = require("express");
require("dotenv").config();
const cors = require("cors");
const connectDB = require("./database/database");
const server = express();

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server is successfully running on port ${PORT}`);
    });
}); 