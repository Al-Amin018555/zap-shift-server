const express = require('express');
const app = express();
require('dotenv').config()
var cors = require('cors');
const port = process.env.PORT || 3000;

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

//middleware
app.use(express.json())
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.q3bebek.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db("zap_shift_db");
        const parcelsCollection = db.collection("parcels");


        // parcel's api's
        app.get('/parcels', async (req, res) => {
            const query = {};
            const { email } = req.query

            if (email) {
                query.senderEmail = email;
            }
            const options = { sort: { createdAt: -1 } }

            const parcels = await parcelsCollection.find(query, options).toArray();
            res.send(parcels);
        })

        app.get('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = new ObjectId(id);

            const result = await parcelsCollection.findOne(query);
            res.send(result);
        })

        app.post('/parcels', async (req, res) => {
            const parcel = req.body;
            parcel.createdAt = new Date();
            const result = await parcelsCollection.insertOne(parcel);
            res.send(result)
        })

        app.delete('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await parcelsCollection.deleteOne(query);
            res.send(result); ``

        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Zap is shifting shfiting!');
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});