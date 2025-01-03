# app/routes.py

from flask import Blueprint, jsonify
import psutil
from time import time

routes = Blueprint('routes', __name__)

@routes.route('/status', methods=['GET'])
def status():
    memory_usage = psutil.virtual_memory()
    uptime = time() - psutil.boot_time()

    return jsonify({
        "service": {
            "name": "aof-service",
            "version": "1.0.0",
            "status": "UP",
            "uptime": uptime
        },
        "system": {
            "loadAverage": psutil.getloadavg(),
            "totalMemory": memory_usage.total,
            "freeMemory": memory_usage.available,
            "memoryUsage": {
                "rss": memory_usage.used,
                "heapTotal": memory_usage.total,
                "heapUsed": memory_usage.used
            }
        }
    }), 200