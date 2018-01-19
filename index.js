const fs = require('fs');
const OAuth = require('./lib/oauth');
const axios = require('axios');
require('dotenv').config();

module.exports = class OrbitSchemaFromOpenApi {
  /**
   * Fetches an OpenAPI definition of a JSON API resources and transforms it into ObritJS compliant schema.
   * @param {object} options
   *   The configuration used to create a new instance of Waterwheel.
   * @param {string} options.base
   *   The base URL.
   * @param {object} options.oauth
   *   The credentials used with each request.
   * @param {string} options.oauth.grant_type
   *   The type of grant you are requesting.
   * @param {string} options.oauth.client_id
   *   The ID of the OAuth Client.
   * @param {string} options.oauth.client_secret
   *   The secret set when the Client was created.
   * @param {string} options.oauth.username
   *   The resource owner username.
   * @param {string} options.oauth.password
   *   The resource owner password.
   * @returns {promise}
   *   Returns a promise which resolves to the Orbit complient schema.
   */
  constructor(options) {
    this.options = options;
    this.convertToOrbit = this.convertToOrbit.bind(this);
    this.serialize = this.serialize.bind(this);
    this.oAuth = new OAuth(this.options.base, this.options.oauth);
  }

  generate() {
    return new Promise((resolve, reject) => {
      const convertToOrbit = this.convertToOrbit;

      this.oAuth.getToken()
        .then(() => {
          axios.get(
            `/openapi/jsonapi?_format=json`,
            {
              method: 'get',
              baseURL: this.options.base,
              headers: {
                'Authorization': `Bearer ${this.oAuth.tokenInformation.access_token}`,
                'Accept': 'application/json'
              }
            })
            .then(response => {
              resolve(convertToOrbit(response.data))
            })
            .catch(error => {
              console.log(error.stack);
            });
        })
    })
  }

  /**
   * Writes a schema to a file.
   * @param   {string} file
   *  The path to the output file.
   * @returns {function}
   *  A function which takes a schema object as a pramater and
   *  returns a new promise which will resolve to the unchanged
   *  schema once the file is written.
   */
  writeToFile(file) {
    return function(schema) {
      return new Promise((resolve, reject) => {
        fs.writeFile(file, JSON.stringify(schema, null, 2), { flags: 'w+' }, function (err) {
          if (err) {
            reject(err);
          }

          console.log(`Schema saved to ${file}`);
          resolve(schema);
        });
      });
    }
  }

  /**
   * Transforms Open API compliant definition of a JSON API resource into a
   * OrbitJS compliant model definition.
   * @param {Object} schema
   *  Open API compliant definition of a JSON API resource
   * @returns {Object}
   *  OrbitJS compliant model definition of a resource.
   */
  serialize(schema) {
    let output = {};

    // Serialize attributes
    if (schema.properties.attributes) {
      output.attributes = {};
      Object.keys(schema.properties.attributes.properties).forEach(prop => {
        const propSchema = schema.properties.attributes.properties[prop];
        output.attributes[prop] = { type: propSchema.type};
      });
    }

    // Serialize relationships
    if (schema.properties.relationships) {
      output.relationships = {};
      Object.keys(schema.properties.relationships.properties).forEach(prop => {
        const propSchema = schema.properties.relationships.properties[prop];

        if (propSchema.properties.data.type === 'array') {
          output.relationships[prop] = {
            type: 'hasMany',
            // @todo: Load the whole array once Orbit supports polymorphic relationships
            //  see: https://github.com/orbitjs/orbit/issues/475
            model: propSchema.properties.data.items.properties.type.enum[0]
          };
        } else {
          output.relationships[prop] = {
            type: 'hasOne',
            // @todo: Load the whole array once Orbit supports polymorphic relationships
            //  see: https://github.com/orbitjs/orbit/issues/475
            model: propSchema.properties.data.properties.type.enum[0]
          };
        }
      });
    }

    return output;
  }

  /**
   * Processes an OpenApi response into an OrbitJs compliant schema.
   * @param   {string} body
   *  OpenApi response body describing a JSON API compliant interface.
   * @return  {object}
   *  An OrbitJs compliant schema.
   */
  convertToOrbit(body) {
    const serialize = this.serialize;

    const entities = typeof (body) === 'string' ? JSON.parse(body).definitions : body.definitions;
    const types = Object.keys(entities);
    const orbitSchema = types.reduce((schema, type) => {
      const resource = type.replace(':', '--');
      schema[resource] = serialize(entities[type]);
      return schema;
    }, {});

    return {
      models: orbitSchema
    }
  }
}

// const testrun = new OrbitSchemaFromOpenApi({
//   base: process.env.DOMAIN,
//   oauth: {
//     grant_type: process.env.GRANT_TYPE,
//     client_id: process.env.CLIENT_ID,
//     client_secret: process.env.CLIENT_SECRET,
//     username: process.env.USER,
//     password: process.env.PASSWORD
//   }
// });
// testrun.generate().then(testrun.writeToFile('./shema.json'));
