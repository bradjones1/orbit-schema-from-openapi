require('dotenv').config();
const fs = require('fs');
const OAuth = require('./lib/oauth');
const axios = require('axios');

class OrbitSchemaFromOpenApi {
  /**
   * Fetches an OpenAPI definition of a JSON API resources and transforms it into ObritJS compliant schema.
   * @param {object} options
   *   The configuration used to create a new instance of OrbitSchemaFromOpenApi.
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
   * @param {object} options.whitelist
   *  An array of resource types to include.
   * @param {string[]} options.whitelist.resources
   *  An array of resource types to be included.
   * @param {object} options.blacklist
   *  Elements to be excluded.
   * @param {string[]} options.blacklist.attributes
   *  An array of attributes to be excluded.
   * @param {string[]} options.blacklist.relationships
   *  An array of relationships to be excluded.
   * @param {function} options.alterRelationship
   *  Allows users to alter a relationship. The function should be in the form of
   * (resource, name, relationship) => ({name, relationship}).
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
      const options = this.options;

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
              resolve(convertToOrbit(response.data, options))
            })
            .catch(error => {
              console.log(error.stack);
            });
        })
        .catch(error => {
          console.log(error.stack);
        });
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
   * @param {object} options.whitelist
   *  Elements to be included.
   * @param {string[]} options.whitelist.resources
   *  An array of resource types to be included.
   * @param {object} options.blacklist
   *  Elements to be excluded.
   * @param {string[]} options.blacklist.attributes
   *  An array of attributes to be excluded.
   * @param {string[]} options.blacklist.relationships
   *  An array of relationships to be excluded.
   * @returns {Object}
   *  OrbitJS compliant model definition of a resource.
   */
  serialize(resource, schema, options) {
    let output = {};

    // Serialize attributes
    if (schema.properties.data.properties.attributes.properties) {
      let properties = schema.properties.data.properties.attributes.properties;
      output.attributes = {};
      Object.keys(properties).forEach(prop => {
        if (options.blacklist
          && options.blacklist.attributes
          && options.blacklist.attributes.indexOf(prop) >= 0
        ) { return; }
        const propSchema = properties[prop];
        if (typeof propSchema === 'array') {
          propSchema = propSchema.filter(value => value !== 'null');
          if (propSchema.length > 1) {
            throw 'Non-null types may not be > 2';
          }
          propSchema = propSchema.shift();
        }
        output.attributes[prop] = {
          type: propSchema.type === "integer" ? "number" : propSchema.type
        };
      });
    }

    // Serialize relationships
    if (schema.properties.data.properties.relationships.properties) {
      let relationships = schema.properties.data.properties.relationships.properties;
      output.relationships = {};
      Object.keys(relationships).forEach(prop => {
        // Respect blacklisted relationships
        if (options.blacklist
          && options.blacklist.relationships
          && options.blacklist.relationships.indexOf(prop) >= 0
        ) { return; }

        const propSchema = relationships[prop];
        let relationship = {};

        if (propSchema.properties.data.type === 'array') {
          relationship = {
            type: 'hasMany',
            kind: propSchema.properties.data.items.properties.type.enum
          };
        } else {
          relationship = {
            type: 'hasOne',
            kind: (typeof propSchema.properties.data.properties.type.enum === 'undefined')
              ? []
              : propSchema.properties.data.properties.type.enum,
          };
        }

        if (options.alterRelationship) {
          const altered = options.alterRelationship(resource, prop, relationship);
          output.relationships[altered.name] = altered.relationship;
        } else {
          output.relationships[prop] = relationship;
        }
      });
    }

    return output;
  }

  /**
   * Processes an OpenApi response into an OrbitJs compliant schema.
   * @param {string} body
   *  OpenApi response body describing a JSON API compliant interface.
   * @param {Object} options
   *  The configuration used to alter the schema output.
   * @param {object} options.whitelist
   *  An array of resource types to include.
   * @param {string[]} options.whitelist.resources
   *  An array of resource types to be included.
   * @param {object} options.blacklist
   *  An array of resource types to be excluded.
   * @param {string[]} options.blacklist.attributes
   *  An array of attributes to be excluded.
   * @param {string[]} options.blacklist.relationships
   *  An array of relationships to be excluded.
   * @return {object}
   *  An OrbitJs compliant schema.
   */
  convertToOrbit(body, options) {
    const serialize = this.serialize;

    const entities = typeof (body) === 'string' ? JSON.parse(body).definitions : body.definitions;
    const types = Object.keys(entities);
    const orbitSchema = types.reduce((schema, type) => {
      // Abort if type is not in the whitelist.
      if (options.whitelist
        && options.whitelist.resources
        && options.whitelist.resources.indexOf(type) < 0
      ) {
        return schema;
      }
      const resource = type.replace(':', '--');
      schema[resource] = serialize(resource, entities[type], options);
      return schema;
    }, {});

    return {
      models: orbitSchema
    }
  }
}

module.exports = OrbitSchemaFromOpenApi;
