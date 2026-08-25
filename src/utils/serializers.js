function serializeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

module.exports = { serializeUser };
