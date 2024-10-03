const jwt = require("jsonwebtoken");
const secretKey =process.env.ADMIN_ACCESS_TOKEN
// Function to validate the token
const validateToken = (token) => {
  try {
    //token=token.replaceAll('"',"")
    const decodedToken = jwt.verify(token, secretKey, {"algorithms":["RS256"]});
    return { valid: true, decodedToken };
  } catch (error) {
    console.log(error)
    return { valid: false, reason: "Invalid token." };
  }
};

module.exports = validateToken;