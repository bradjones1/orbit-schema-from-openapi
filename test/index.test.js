require('dotenv').config();
const OrbitSchemaFromOpenApi = require('./../index');

test('Environment variables are set', () => {
  expect(process.env.DOMAIN).toBeDefined();
  expect(process.env.GRANT_TYPE).toBeDefined();
  expect(process.env.CLIENT_ID).toBeDefined();
  expect(process.env.CLIENT_SECRET).toBeDefined();
  expect(process.env.USERNAME).toBeDefined();
  expect(process.env.PASSWORD).toBeDefined();
});


test('Fetches a schema', (done) => {
  /// Test implementation
  const testrun = new OrbitSchemaFromOpenApi({
    base: process.env.DOMAIN,
    oauth: {
      grant_type: process.env.GRANT_TYPE,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      username: process.env.USERNAME,
      password: process.env.PASSWORD
    }
  }).generate().then((schema) => {
    expect(schema).toHaveProperty('models');
    done();
  });

  expect(testrun).toBeInstanceOf(Promise);
});
