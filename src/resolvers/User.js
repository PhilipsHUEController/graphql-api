const kafka = require('kafka-node')
const { User, Command } = require('../../models')

const { getKafkaServiceInstance } = require('../kafkaService');

module.exports = {
  // fetch the commands of currenly athenticated user
  async commands(user) {
    const commands = await Command.findAll({
      where: {
        userId: user.id
      }
    });

    if (!commands) throw new Error('Failed to find commands!')

    return commands;
  },

  async command(user, { fromCommand, type, valueFrom, valueTo }) {
    if (!fromCommand || !type){
      throw new Error('fromCommand and type are mandatory!');
    }

    const command = await Command.findOne({
      where: {
        userId: user.id,
        from: fromCommand,
        type,
        valueFrom: valueFrom ? valueFrom : "",
        valueTo: valueTo ? valueTo : "",
      }
    });
    if (!command) throw new Error('Failed to find command!')

    return command;
  },

  async latestEEGClassification(user, _) {

    const kafkaClient = getKafkaServiceInstance().createClient();

    return await (new Promise((resolve, reject) => {

      kafkaClient.on('ready', () => {

        const offset = new kafka.Offset(kafkaClient);

        const topic = process.env.KAFKA_TOPIC;
        const partition = user.id
        const topics = [{ topic, partition }];

        offset.fetchLatestOffsets([topic], (error, offsets) => {
          const defaultResponse = {
            SMO: "Not classified",
            MULTILAYER_PERCEPTRON: "Not classified",
            RANDOM_FOREST: "Not classified"
          };

          if (error || !offsets || !offsets[topic][partition]) {
            return resolve(defaultResponse)
          }

          const latestOffset = offsets[topic][partition];

          if (latestOffset === 0) {
            return resolve(defaultResponse);
          }

          // Get latest message from partition
          const topics = [{ topic: topic, partition: user.id, offset: latestOffset-1 }];
          const options = { autoCommit: false, fromOffset: true };

          const consumer = new kafka.Consumer(kafkaClient, topics, options);

          consumer.on('message', (message) => {
            consumer.close(true, () => {
              resolve(JSON.parse(message.value));
            });
          });

          consumer.on('error', (err) => {
            consumer.close(true, () => {
              reject(err);
            });
          });

        });
      });
    }));
  }
}
