const _ = require('lodash');
const Promise = require('bluebird');
const AWS = require('aws-sdk');
const uuid = require('uuid');
const promisifyMethod = (obj, name) => (...args) =>
  new Promise((resolve, reject) =>
    obj[name](...args, (err, res) => {
      if (err) {
        return reject(err);
      }

      resolve(res);
    }),
  );

class DynamoDbAdapter {
  /**
   * Creates an instance of DynamoDbAdapter.
   * @param {String} uri
   * @param {Object?} opts
   *
   * @memberof DynamoDbAdapter
   */
  constructor(opts) {
    this.opts = opts;

    if (!opts.aws) {
      throw new Error('aws config should be provided');
    }
  }

  /**
   * Initialize adapter
   *
   * @param {ServiceBroker} broker
   * @param {Service} service
   *
   * @memberof DynamoDbAdapter
   */
  init(broker, service) {
    this.broker = broker;
    this.service = service;
    const { aws } = this.opts;

    AWS.config.update(aws);

    if (!this.service.schema.model) {
      /* istanbul ignore next */
      throw new Error('Missing `model` or definition in schema of service!');
    }

    this.model = this.service.schema.model;

    this.methods = {
      create: promisifyMethod(this.model, 'create'),
      get: promisifyMethod(this.model, 'get'),
      update: promisifyMethod(this.model, 'update'),
      destroy: promisifyMethod(this.model, 'destroy'),
      describeTable: promisifyMethod(this.model, 'describeTable'),
      createTable: promisifyMethod(this.model, 'describeTable'),
    };
  }

  /**
   * Connect to database
   *
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  async connect() {
    AWS.config.update(this.opts);
    const dynamodb = new AWS.DynamoDB();

    this.model.config({ dynamodb });

    if (this.opts.shouldCreateTable) {
      await new Promise((resolve, reject) =>
        this.model.createTable((err, r) => {
          if (err) {
            if (err.code !== 'ResourceInUseException') {
              return reject(err);
            }
          }

          resolve(r);
        }),
      );
    }

    const res = await new Promise((r, j) =>
      this.model.describeTable((err, res) => {
        if (err) j(err);
        r(res);
      }),
    );

    this.hashKey = res.Table.KeySchema.find(
      ({ KeyType }) => KeyType === 'HASH',
    ).AttributeName;
  }

  /**
   * Disconnect from database
   *
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  disconnect() {
    return Promise.resolve();
  }

  /**
   * Find all entities by filters.
   *
   * Available filter props:
   * 	- limit
   *  - offset
   *  - sort
   *  - search
   *  - searchFields
   *  - query
   *
   * @param {any} filters
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  find(filters) {
    return new Promise((resolve, reject) =>
      this.createCursor(filters).exec((err, res) => {
        if (err) {
          return reject(err);
        }

        resolve(res.Items);
      }),
    );
  }

  /**
   * Find an entities by ID
   *
   * @param {any} _id
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  findById(_id) {
    return this.methods.get(_id);
  }

  /**
   * Find any entities by IDs
   *
   * @param {Array} idList
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  findByIds(idList) {
    return new Promise((resolve, reject) => {
      this.model
        .scan()
        .where(this.hashKey)
        .in(idList)
        .exec((err, res) => {
          if (err) return reject(err);

          resolve(res);
        });
    });
  }

  /**
   * Get count of filtered entites
   *
   * Available filter props:
   *  - search
   *  - searchFields
   *  - query
   *
   * @param {Object} [filters={}]
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  count(/*filters = {}*/) {
    return 0;
  }

  /**
   * Insert an entity
   *
   * @param {Object} entity
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  insert(entity) {
    if (!entity.id) {
      entity.id = uuid.v4();
    }

    return this.methods.create(entity);
  }

  /**
   * Insert many entities
   *
   * @param {Array} entities
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  insertMany(entities) {
    entities.forEach(entity => {
      if (!entity.id) {
        entity.id = uuid.v4();
      }
    });

    return this.methods.create(entities);
  }

  /**
   * Update an entity by ID and `update`
   *
   * @param {any} hash
   * @param {Object} update
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  updateById(id, update) {
    const data = { ...update.$set, [this.hashKey]: id };

    return this.methods.update(data);
  }

  /**
   * Remove an entity by ID
   *
   * @param {any} hash
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  async removeById(id) {
    return this.methods.destroy(id, { ReturnValues: 'ALL_OLD' });
  }

  /**
   * Clear all entities from collection
   *
   * @returns {Promise}
   *
   * @memberof DynamoDbAdapter
   */
  clear() {
    return this.model.destroy({});
  }

  /**
   * Convert DB entity to JSON object
   *
   * @param {any} entity
   * @returns {Object}
   * @memberof DynamoDbAdapter
   */
  entityToObject(entity) {
    return typeof entity.toJSON === 'function' ? entity.toJSON() : entity;
  }

  /**
   * Create a filtered query
   * Available filters in `params`:
   *  - search
   * 	- sort
   * 	- limit
   * 	- offset
   *  - query
   *
   * @param {Object} params
   * @returns {MongoQuery}
   */
  createCursor(params) {
    if (params) {
      const q = this.model.scan();
      // Limit
      if (_.isNumber(params.limit) && params.limit > 0) {
        q.limit(params.limit);
      }

      const { query = {} } = params;

      Object.keys(query).forEach(key => {
        q.where(key).equals(query[key]);
      });

      return q.loadAll();
    }

    return this.model.scan().loadAll();
  }

  /**
   * Transforms 'idField' into DynamoDb's 'hash'
   * @param {Object} entity
   * @param {String} idField
   * @memberof DynamoDbAdapter
   * @returns {Object} Modified entity
   */
  beforeSaveTransformID(entity /*, idField*/) {
    let newEntity = _.cloneDeep(entity);

    return newEntity;
  }

  /**
   * Transforms DynamoDb's 'hash' into user defined 'idField'
   * @param {Object} entity
   * @param {String} idField
   * @memberof DynamoDbAdapter
   * @returns {Object} Modified entity
   */
  afterRetrieveTransformID(entity /*, idField*/) {
    return entity;
  }
}

module.exports = DynamoDbAdapter;
