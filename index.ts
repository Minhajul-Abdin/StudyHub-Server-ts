
import dotenv from "dotenv";
dotenv.config();

import express, {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  ObjectId,
  MongoClient,
  ServerApiVersion,
} from "mongodb";

import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";

import cors from "cors";

const app = express();

app.use(express.json());

const port = process.env.PORT || 8080;

app.use(
  cors({
    origin: ["https://studynook-self.vercel.app"],
    optionsSuccessStatus: 200,
  }),
);

// ------------------------------------------------------------
// JWT
// ------------------------------------------------------------

const clientUrl = process.env.CLIENT_URL;

if (!clientUrl) {
  throw new Error("CLIENT_URL is not defined");
}

const JWKS = createRemoteJWKSet(
  new URL(`${clientUrl}/api/auth/jwks`),
);

// ------------------------------------------------------------
// MongoDB
// ------------------------------------------------------------

const uri = process.env.MONGOBD_URI;

if (!uri) {
  throw new Error("MONGOBD_URI is not defined");
}

// Create a MongoClient with a MongoClientOptions object
// to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ------------------------------------------------------------
// Route Parameter Types
// ------------------------------------------------------------

interface UserIdParams {
  [key: string]: string;
  userId: string;
}

interface RoomIdParams {
  [key: string]: string;
  roomId: string;
}

interface BookingIdParams {
  [key: string]: string;
  id: string;
}


// ------------------------------------------------------------
// Logger
// ------------------------------------------------------------

const logger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.log(`${req.method} | ${req.url}`);
  next();
};

// ------------------------------------------------------------
// Verify Token
// ------------------------------------------------------------

const varifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { authorization } = req.headers;

  const token = authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json({
      message: "Unauthorize",
    });
    return;
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL(
        "https://studynook-self.vercel.app/api/auth/jwks",
      ),
    );

    const { payload } = await jwtVerify(
      token,
      JWKS,
    );

    (req as any).user = payload;

    next();
  } catch (error) {
    console.error(
      "Token validation failed:",
      error,
    );

    res.status(401).json({
      message: "Unauthorize",
    });
  }
};

// ------------------------------------------------------------
// MongoDB Run
// ------------------------------------------------------------

async function run(): Promise<void> {
  try {
    // Connect the client to the server
    // await client.connect();

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    const db = client.db("studynookdb");

    const roomCollection = db.collection("rooms");
    const bookingCollection = db.collection("bookings");
    const listingCollection = db.collection("listings");

    // ------------------------------------------------------------
    // Add Room
    // ------------------------------------------------------------

    app.post(
      "/rooms",
      varifyToken,
      async (
        req: Request,
        res: Response,
      ): Promise<void> => {
        const data = req.body;

        console.log(data);

        const result =
          await roomCollection.insertOne(data);

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // Get All Rooms
    // ------------------------------------------------------------

    app.get(
      "/rooms",
      async (
        req: Request,
        res: Response,
      ): Promise<void> => {
        const { search } = req.query;

        let cursor;

        if (search) {
          cursor = await roomCollection.find({
            $or: [
              {
                room_name: {
                  $regex: search as string,
                  $options: "i",
                },
              },
            ],
          });
        } else {
          cursor = roomCollection.find();
        }

        const result =
          await cursor.toArray();

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // Latest Rooms
    // ------------------------------------------------------------

    app.get(
      "/latest",
      async (
        req: Request,
        res: Response,
      ): Promise<void> => {
        const cursor =
          roomCollection.find().limit(6);

        const result =
          await cursor.toArray();

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // My Booking Page API
    // ------------------------------------------------------------

    app.get<UserIdParams>(
      "/mybookings/:userId",
      async (
        req,
        res,
      ): Promise<void> => {
        const { userId } = req.params;

        const result =
          await bookingCollection
            .find({
              userId: userId,
            })
            .toArray();

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // Create Booking
    // ------------------------------------------------------------

    app.patch<RoomIdParams>(
      "/mybookings/:roomId",
      async (
        req,
        res,
      ): Promise<void> => {
        const { roomId } = req.params;

        const bookingData = req.body;

        const room =
          await roomCollection.findOne({
            _id: new ObjectId(roomId),
          });

        if (!room) {
          res.status(404).json({
            message: "Room not found ",
          });
          return;
        }

        await roomCollection.updateOne(
          {
            _id: new ObjectId(roomId),
          },
          {
            $inc: {
              bookCount: 1,
            },
            $set: {
              lastBookedAt: new Date(),
            },
          },
        );

        const result =
          await bookingCollection.insertOne({
            ...bookingData,
            status: "Approved",
            roomId: room._id,
            bookAt: new Date(),
          });

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // My Listing Page API
    // ------------------------------------------------------------

    app.get<UserIdParams>(
      "/mylisting/:userId",
      async (
        req,
        res,
      ): Promise<void> => {
        const { userId } = req.params;

        const result =
          await roomCollection
            .find({
              userId: userId,
            })
            .toArray();

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // Get Single Room
    // ------------------------------------------------------------

    app.get<RoomIdParams>(
      "/rooms/:roomId",
      async (
        req,
        res,
      ): Promise<void> => {
        const { roomId } = req.params;

        console.log(roomId);

        const query = {
          _id: new ObjectId(roomId),
        };

        const result =
          await roomCollection.findOne(query);

        console.log(result);

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // Create Booking From Room
    // ------------------------------------------------------------

    app.patch<RoomIdParams>(
      "/rooms/:roomId",
      async (
        req,
        res,
      ): Promise<void> => {
        const { roomId } = req.params;

        const bookingData = req.body;

        const room =
          await roomCollection.findOne({
            _id: new ObjectId(roomId),
          });

        if (!room) {
          res.status(404).json({
            message: "Room not found ",
          });
          return;
        }

        await roomCollection.updateOne(
          {
            _id: new ObjectId(roomId),
          },
          {
            $inc: {
              bookCount: 1,
            },
            $set: {
              lastBookedAt: new Date(),
            },
          },
        );

        const result =
          await bookingCollection.insertOne({
            ...bookingData,
            bookAt: new Date(),
          });

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // Cancel Booking
    // ------------------------------------------------------------

    app.patch<BookingIdParams>(
      "/mybooking/:id",
      varifyToken,
      async (
        req,
        res,
      ): Promise<void> => {
        const { id } = req.params;

        const booking =
          await bookingCollection.findOne({
            _id: new ObjectId(id),
          });

        if (!booking) {
          res.status(404).send({
            message: "Booking not found",
          });
          return;
        }

        const roomId = booking.roomId;

        const result =
          await bookingCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                status: "Canceled",
              },
            },
          );

        await roomCollection.updateOne(
          {
            _id: new ObjectId(roomId),
          },
          {
            $inc: {
              bookCount: -1,
            },
          },
        );

        res.send(result);
      },
    );

    // ------------------------------------------------------------
    // Update Room
    // ------------------------------------------------------------

    app.put<RoomIdParams>(
      "/rooms/:roomId",
      async (
        req,
        res,
      ): Promise<void> => {
        const { roomId } = req.params;

        const updatedData = req.body;

        const result =
          await roomCollection.updateOne(
            {
              _id: new ObjectId(roomId),
            },
            {
              $set: updatedData,
            },
          );

        res.json(result);
      },
    );

    // ------------------------------------------------------------
    // Delete Room
    // ------------------------------------------------------------

    app.delete<RoomIdParams>(
      "/rooms/:roomId",
      async (
        req,
        res,
      ): Promise<void> => {
        const { roomId } = req.params;

        const result =
          await roomCollection.deleteOne({
            _id: new ObjectId(roomId),
          });

        res.json(result);
      },
    );

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

// ------------------------------------------------------------
// Run
// ------------------------------------------------------------

run().catch(console.dir);

// ------------------------------------------------------------
// Root Route
// ------------------------------------------------------------

app.get(
  "/",
  (
    req: Request,
    res: Response,
  ): void => {
    res.send("Hello World!");
  },
);

// ------------------------------------------------------------
// Start Server
// ------------------------------------------------------------

app.listen(port, () => {
  console.log(
    `Example app listening on port ${port}`,
  );
});

