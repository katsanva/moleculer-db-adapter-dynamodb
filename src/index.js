const _ = require('lodash');
const AWS = require('aws-sdk');

class DynamoDbAdapter {
  /**
   * Creates an instance of DynamoDbAdapter.
   * @param {string} uri
   * @param {unknown} [opts]
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
   * @param {import('moleculer').ServiceBroker} broker
   * @param {import('moleculer').Service} service
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

    /**
     * @type import('dynamodb').Model
     */
    this.model = this.service.schema.model;
  }

  /**
   * Connect to database
   *
   * @returns {Promise<void>}
   *
   * @memberof DynamoDbAdapter
   */
  async connect() {
    AWS.config.update(this.opts);
    const dynamodb = new AWS.DynamoDB();

    this.model.config({ dynamodb });

    if (this.opts.shouldCreateTable) {
      await this.model.createTable().catch((err) => {
        if (err.code === 'ResourceInUseException') {
          return;
        }

        throw err;
      });
    }

    // remove unnecessary lookups of hashKey when its user provided
    //     const res = await new Promise((r, j) =>
    //       this.model.describeTable((err, res) => {
    //         if (err) j(err);
    //         r(res);
    //       }),
    //     );

    //     this.hashKey = res.Table.KeySchema.find(
    //       ({ KeyType }) => KeyType === 'HASH',
    //     ).AttributeName;

    this.hashKey = this.opts.hashKey;
    this.rangeKey = this.opts.rangeKey;
    this.indexes = this.opts.indexes;
  }

  /**
   * Disconnect from database
   *
   * @returns {Promise<void>}
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
   *
   * @param {object} filters
   * @param {number} filters.limit
   * @param {number} filters.offset
   * @param {*} filters.sort
   * @param {*} filters.search
   * @param {*} filters.searchFields
   * @param {*} filters.searchFields
   * @param {*} filters.query
   * @returns {Promise<T>}
   *
   * @memberof DynamoDbAdapter
   */
  async find(filters) {
    const { Items } = await this.createCursor(filters).exec();

    return Items;
  }

  /**
   *
   * @param {*} filters
   * @returns {Promise<any>}
   */
  async findOne(filters) {
    const item = await this.find({ ...filters, ...{ limit: 1 } });

    return item.length === 1 ? item[0] : null;
  }

  /**
   * Find an entities by ID
   *
   * @param {any} _id
   * @returns {Promise<import('dynamodb').Model>}
   *
   * @memberof DynamoDbAdapter
   */
  findById(_id) {
    return this.model.get(_id);
  }

  /**
   * Find any entities by IDs
   *
   * @param {string[]} idList
   * @returns {ReturnType<ReturnType<import('dynamodb').Model['scan']>['exec']>}
   *
   * @memberof DynamoDbAdapter
   */
  findByIds(idList) {
    //TODO: this is very inefficient.  refactor

    return this.model.scan().where(this.hashKey).in(idList).exec();
  }

  /**
   * Get count of filtered entites
   *
   * Available filter props:
   *  - search
   *  - searchFields
   *  - query
   *
   * @param {object} [filters={}]
   * @returns {number}
   *
   * @memberof DynamoDbAdapter
   */
  count(/*filters = {}*/) {
    //TODO: this is crap
    return 0;
  }

  /**
   * Insert an entity
   *
   * @param {Object} entity
   * @returns {ReturnType<import('dynamodb').Model['create']>}
   *
   * @memberof DynamoDbAdapter
   */
  insert(entity) {
    // this is unnecessary
    //     if (!entity.id) {
    //       entity.id = uuid.v4();
    //     }

    return this.model.create(entity);
  }

  /**
   * Insert many entities
   *
   * @param {Array} entities
   * @returns {ReturnType<import('dynamodb').Model['create']>}
   *
   * @memberof DynamoDbAdapter
   */
  insertMany(entities) {
    // this is unnecessary
    //     entities.forEach(entity => {
    //       if (!entity.id) {
    //         entity.id = uuid.v4();
    //       }
    //     });

    return this.model.create(entities);
  }

  /**
   * Update an entity by ID and `update`
   *
   * @param {any} hash
   * @param {Object} update
   * @returns {ReturnType<import('dynamodb').Model['update']>}
   *
   * @memberof DynamoDbAdapter
   */
  updateById(id, update) {
    //TODO: what about range key?
    const data = { ...update.$set, [this.hashKey]: id };

    return this.model.update(data);
  }

  //TODO: missing straight update method

  /**
   * Remove an entity by ID
   *
   * @param {any} hash
   * @returns {ReturnType<import('dynamodb').Model['destroy']>}
   *
   * @memberof DynamoDbAdapter
   */
  async removeById(id) {
    return this.model.destroy(id, { ReturnValues: 'ALL_OLD' });
  }

  /**
   * Clear all entities from collection
   *
   * @returns {ReturnType<import('dynamodb').Model['destroy']>}
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
   * @returns {object}
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
   * @returns {ReturnType<ReturnType<import('dynamodb').Model['scan']>['loadAll']>}
   */
  createCursor(params) {
    if (!params) {
      return this.model.scan().loadAll();
    }

    const scan = this.model.scan();

    // Limit
    if (_.isNumber(params.limit) && params.limit > 0) {
      scan.limit(params.limit);
    }

    const { query = {} } = params;

    Object.keys(query).forEach((key) => {
      scan.where(key).equals(query[key]);
    });

    return scan.loadAll();
  }

  /**
   * Transforms 'idField' into DynamoDb's 'hash'
   * @param {object} entity
   * @param {string} idField
   * @memberof DynamoDbAdapter
   * @returns {object} Modified entity
   */
  beforeSaveTransformID(entity /*, idField*/) {
    let newEntity = _.cloneDeep(entity);

    return newEntity;
  }

  /**
   * Transforms DynamoDb's 'hash' into user defined 'idField'
   * @param {object} entity
   * @param {string} idField
   * @memberof DynamoDbAdapter
   * @returns {object} Modified entity
   */
  afterRetrieveTransformID(entity /*, idField*/) {
    return entity;
  }
}

module.exports = DynamoDbAdapter;
