const validateToken = require('./validateToken');

const tokenValidatorMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];


  if (!token) {
    return res.status(401).json({ error: 'Token not provided.' });
  }


  const tokenValidationResult = validateToken(token);

  if (!tokenValidationResult.valid) {
    return res.status(401).json({ error: tokenValidationResult.reason });
  }

  req.accessToken = token;

  next();
};

module.exports = tokenValidatorMiddleware;