async function routes(fastify, options) {
	//todo: route for match history based on userId
       fastify.get(
               "/matchhistory/:userid",
               {
                       onRequest: [fastify.authenticate],
               },
               async (request, reply) => {
                       if (!request.params.userid) {
                               reply.statusCode = 400;
                               return { error: "Missing required fields" };
                       }

                       const userId = parseInt(request.params.userid);
                       if (Number.isNaN(userId)) {
                               reply.statusCode = 400;
                               return { error: "Invalid user id" };
                       }

                       let limit = parseInt(request.query.limit);
                       let offset = parseInt(request.query.offset);
                       if (Number.isNaN(limit) || limit <= 0) limit = 20;
                       if (limit > 2000) limit = 2000;
                       if (Number.isNaN(offset) || offset < 0) offset = 0;

                       try {
                               const result = await fastify.sqlite.all(
                                       `SELECT
                                       gh.timestamp,
                                       gh.winnerId,
                                       gh.loserId,
                                       uw.username   AS winner_username,
                                       ul.username   AS loser_username,
                                       gh.scoreWinner,
                                       gh.scoreLoser,
                                       t.name        AS tournament_name
                                       FROM
                                       game_history AS gh
                                       JOIN users AS uw
                                       ON gh.winnerId = uw.id
                                       JOIN users AS ul
                                       ON gh.loserId  = ul.id
                                       LEFT JOIN tournament AS t
                                       ON gh.tournamentId = t.tournamentId
                                       WHERE
                                       gh.winnerId = ? OR gh.loserId = ?
                                       ORDER BY
                                       gh.timestamp DESC
                                       LIMIT ? OFFSET ?;`,
                                       [userId, userId, limit, offset]
                               );
                               if (!result) {
                                       reply.statusCode = 404;
                                       return { error: "history not found" };
                               }
                               return result;
                       }
                       catch (error) {
                               console.error("Error getting match history: " + error.message);
                               reply.statusCode = 500;
                               return { error: "Error getting match history" };
                       }
               }
       );
}

module.exports.routes = routes;
