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
      password: process.env.PASSWORD,
    },
    alterRelationship: (resource, name, relationship) => {
      let output = {
        name,
        relationship
      };
      switch (name) {
        case 'parent':
          output.relationship.model = resource;
          break;
      }

      return output;
    }
  }).generate().then((schema) => {
    expect(schema).toHaveProperty('models');
    expect(schema.models['taxonomy_term--tag']).toBeInstanceOf(Object);
    expect(schema.models['taxonomy_term--tag'].relationships.parent.model).toBe('taxonomy_term--tag');
    done();
  });

  expect(testrun).toBeInstanceOf(Promise);
});
