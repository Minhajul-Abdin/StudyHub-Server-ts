import dotenv from "dotenv";
dotenv.config();

import express, {
  Request,
  Response,
  NextFunction,
} from "express";

import cors from "cors";

import {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Collection,
  Db,
} from "mongodb";

import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();

app.use(express.json());

const port = process.env.PORT || 8080;

app.use(
  cors({
    origin: ["https://studynook-self.vercel.app"],
    optionsSuccessStatus: 200,
  }),
);

// --------------------------------------------------
// Environment Variables
// --------------------------------------------------

const uri = process.env.MONGOBD_URI;

if (!uri) {
  throw new Error("MONGOBD_URI is not defined");
}

const CLIENT_URL =
  process.env.CLIENT_URL || "https://studynook-self.vercel.app";

// --------------------------------------------------
// MongoDB
// --------------------------------------------------

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// --------------------------------------------------
// Types
// --------------------------------------------------

interface Room {
  _id?: ObjectId;
  userId: string;
  room_name: string;
  short_description: string;
  room_image_url: string;
  floor: string;
  seat_capacity: number;
  hourly_rate: number;
  amenities: string[];
  bookCount?: number;
  lastBookedAt?: Date;
}

interface Booking {
  _id?: ObjectId;
  userId: string;
  roomId: ObjectId;
  roomTitle?: string;
  roomImage?: string;
  status: string;
  bookAt: Date;
}

interface AuthenticatedRequest extends Request {
  user?: Record<string, unknown>;
}

// --------------------------------------------------
// JWT
// --------------------------------------------------

const JWKS = createRemoteJWKSet(
  new URL(`${CLIENT_URL}/api/auth/jwks`),
);

// --------------------------------------------------
// Logger Middleware
// --------------------------------------------------

const logger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.log(`${req.method} | ${req.url}`);
  next();
};

app.use(logger);

// --------------------------------------------------
// Verify Token Middleware
// --------------------------------------------------

const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { authorization } = req.headers;

  const token = authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  try {
    const jwks = createRemoteJWKSet(
      new URL(`${CLIENT_URL}/api/auth/jwks`),
    );

    const { payload } = await jwtVerify(token, jwks);

    req.user = payload;

    next();
  } catch (error) {
    console.error("Token validation failed:", error);

    res.status(401).json({
      message: "Unauthorized",
    });
  }
};

// --------------------------------------------------
// MongoDB Collections
// --------------------------------------------------

async function run(): Promise<void> {
  try {
    const db: Db = client.db("studynookdb");

    const roomCollection: Collection<Room> =
      db.collection<Room>("rooms");

    const bookingCollection: Collection<Booking> =
      db.collection<Booking>("bookings");

    // --------------------------------------------------
    // Add Room
    // --------------------------------------------------

    app.post(
      "/rooms",
      verifyToken,
      async (
        req: Request,
        res: Response,
      ): Promise<void> => {
        try {
          const data = req.body as Room;

          console.log(data);

          const result = await roomCollection.insertOne(data);

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to add room",
          });
        }
      },
    );

    // --------------------------------------------------
    // Get All Rooms
    // --------------------------------------------------

    app.get(
      "/rooms",
      async (
        req: Request,
        res: Response,
      ): Promise<void> => {
        try {
          const search = req.query.search as
            | string
            | undefined;

          let cursor;

          if (search) {
            cursor = roomCollection.find({
              $or: [
                {
                  room_name: {
                    $regex: search,
                    $options: "i",
                  },
                },
              ],
            });
          } else {
            cursor = roomCollection.find();
          }

          const result = await cursor.toArray();

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to fetch rooms",
          });
        }
      },
    );

    // --------------------------------------------------
    // Latest Rooms
    // --------------------------------------------------

    app.get(
      "/latest",
      async (
        req: Request,
        res: Response,
      ): Promise<void> => {
        try {
          const result = await roomCollection
            .find()
            .limit(6)
            .toArray();

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to fetch latest rooms",
          });
        }
      },
    );

    // --------------------------------------------------
    // My Bookings
    // --------------------------------------------------

    app.get(
      "/mybookings/:userId",
      async (
        req: Request<{ userId: string }>,
        res: Response,
      ): Promise<void> => {
        try {
          const { userId } = req.params;

          const result = await bookingCollection
            .find({ userId })
            .toArray();

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to fetch bookings",
          });
        }
      },
    );

    // --------------------------------------------------
    // Create Booking
    // --------------------------------------------------

    app.patch(
      "/mybookings/:roomId",
      async (
        req: Request<{ roomId: string }>,
        res: Response,
      ): Promise<void> => {
        try {
          const { roomId } = req.params;

          const bookingData = req.body as Omit<
            Booking,
            "_id" | "roomId" | "bookAt" | "status"
          >;

          if (!ObjectId.isValid(roomId)) {
            res.status(400).json({
              message: "Invalid room ID",
            });
            return;
          }

          const objectRoomId = new ObjectId(roomId);

          const room = await roomCollection.findOne({
            _id: objectRoomId,
          });

          if (!room) {
            res.status(404).json({
              message: "Room not found",
            });
            return;
          }

          await roomCollection.updateOne(
            { _id: objectRoomId },
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
              roomId: objectRoomId,
              bookAt: new Date(),
            });

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to create booking",
          });
        }
      },
    );

    // --------------------------------------------------
    // My Listings
    // --------------------------------------------------

    app.get(
      "/mylisting/:userId",
      async (
        req: Request<{ userId: string }>,
        res: Response,
      ): Promise<void> => {
        try {
          const { userId } = req.params;

          const result = await roomCollection
            .find({ userId })
            .toArray();

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to fetch listings",
          });
        }
      },
    );

    // --------------------------------------------------
    // Get Single Room
    // --------------------------------------------------

    app.get(
      "/rooms/:roomId",
      async (
        req: Request<{ roomId: string }>,
        res: Response,
      ): Promise<void> => {
        try {
          const { roomId } = req.params;

          if (!ObjectId.isValid(roomId)) {
            res.status(400).json({
              message: "Invalid room ID",
            });
            return;
          }

          const result =
            await roomCollection.findOne({
              _id: new ObjectId(roomId),
            });

          if (!result) {
            res.status(404).json({
              message: "Room not found",
            });
            return;
          }

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to fetch room",
          });
        }
      },
    );

    // --------------------------------------------------
    // Cancel Booking
    // --------------------------------------------------

    app.patch(
      "/mybooking/:id",
      verifyToken,
      async (
        req: Request<{ id: string }>,
        res: Response,
      ): Promise<void> => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            res.status(400).json({
              message: "Invalid booking ID",
            });
            return;
          }

          const bookingId = new ObjectId(id);

          const booking =
            await bookingCollection.findOne({
              _id: bookingId,
            });

          if (!booking) {
            res.status(404).json({
              message: "Booking not found",
            });
            return;
          }

          const roomId = booking.roomId;

          const result =
            await bookingCollection.updateOne(
              { _id: bookingId },
              {
                $set: {
                  status: "Canceled",
                },
              },
            );

          if (roomId) {
            await roomCollection.updateOne(
              { _id: roomId },
              {
                $inc: {
                  bookCount: -1,
                },
              },
            );
          }

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to cancel booking",
          });
        }
      },
    );

    // --------------------------------------------------
    // Update Room
    // --------------------------------------------------

    app.put(
      "/rooms/:roomId",
      async (
        req: Request<{ roomId: string }>,
        res: Response,
      ): Promise<void> => {
        try {
          const { roomId } = req.params;

          if (!ObjectId.isValid(roomId)) {
            res.status(400).json({
              message: "Invalid room ID",
            });
            return;
          }

          const updatedData =
            req.body as Partial<Room>;

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
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to update room",
          });
        }
      },
    );

    // --------------------------------------------------
    // Delete Room
    // --------------------------------------------------

    app.delete(
      "/rooms/:roomId",
      async (
        req: Request<{ roomId: string }>,
        res: Response,
      ): Promise<void> => {
        try {
          const { roomId } = req.params;

          if (!ObjectId.isValid(roomId)) {
            res.status(400).json({
              message: "Invalid room ID",
            });
            return;
          }

          const result =
            await roomCollection.deleteOne({
              _id: new ObjectId(roomId),
            });

          res.json(result);
        } catch (error) {
          console.error(error);

          res.status(500).json({
            message: "Failed to delete room",
          });
        }
      },
    );

    console.log(
      "Successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error(error);
  }
}

run().catch(console.dir);

// --------------------------------------------------
// Root Route
// --------------------------------------------------

app.get(
  "/",
  (req: Request, res: Response): void => {
    res.send("Hello World!");
  },
);

// --------------------------------------------------
// Start Server
// --------------------------------------------------

app.listen(port, () => {
  console.log(
    `Example app listening on port ${port}`,
  );
});

