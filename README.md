# moleculer-db-adapter-dynamodb [![NPM version](https://img.shields.io/npm/v/moleculer-db-adapter-dynamodb.svg)](https://www.npmjs.com/package/moleculer-db-adapter-dynamodb)

[DynamoDB](https://aws.amazon.com/dynamodb) adapter for Moleculer DB service with [dynamodb](https://github.com/baseprime/dynamodb).

## Features

## Install

```sh
npm install moleculer-db-adapter-dynamodb --save
```

You have to install additional packages for creating model:

```bash
npm install dynamodb --save
```

### Usage

```js
'use strict';

const { ServiceBroker } = require('moleculer');
const DbService = require('moleculer-db');
const DynamoAdapter = require('moleculer-db-adapter-dynamodb');
const dynamodb = require('dynamodb');
const Joi = require('joi');

const broker = new ServiceBroker();

// Create a dynamodb service for `post` entities
broker.createService({
  name: 'posts',
  mixins: [DbService],
  adapter: new DynamoAdapter({
    accessKeyId: '', // your id here
    secretAccessKey: '', // your key here
    region: '', // your region here
  }),
  model: dynamodb.define('Post', {
    id: dynamo.types.uuid(),
    title: Joi.string().required(),
    content: Joi.string().required(),
    votes: Joi.number(),
  }),
});

broker
  .start()
  // Create a new post
  .then(() =>
    broker.call('posts.create', {
      title: 'My first post',
      content: 'Lorem ipsum...',
      votes: 0,
    }),
  )

  // Get all posts
  .then(() => broker.call('posts.find').then(console.log));
```

### Options

Every constructor arguments are passed to the `aws-sdk` config . Read more about [aws sdk](https://github.com/aws/aws-sdk-js).

#### Example with connection options

```js
new DynamoAdapter({
  accessKeyId: '', // your id here
  secretAccessKey: '', // your key here
  region: '', // your region here
});
```

## Test

```sh
npm test
```

In development with watching

```sh
npm run watch:test
```

## License

The project is available under the [MIT license](https://tldrlegal.com/license/mit-license).
