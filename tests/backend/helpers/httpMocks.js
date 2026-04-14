function createMockReq(overrides = {}) {
  const headers = {};
  return {
    params: {},
    query: {},
    body: {},
    get: (name) => headers[String(name).toLowerCase()] || "",
    setHeader: (name, value) => {
      headers[String(name).toLowerCase()] = value;
    },
    ...overrides,
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

module.exports = {
  createMockReq,
  createMockRes,
};
