# Uptime Watch

## Plan

1. Turborepo initialize
2. Create a Node.js backend with Express, exposes 1 endpoint
3. Add Prisma to it (as a separate package)
4. Complete the CRUD app
5. Decide the queue you'll use (SQS, NATS, Redis Streams, Kafka)
6. Create the publisher
7. Create the worker
8. Use a timeseries DB (ClickHouse) to shove timeseries data
