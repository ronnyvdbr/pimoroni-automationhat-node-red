/**
 * Copyright 2016 Pimoroni Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";

	var nodename = "Automationhat o1";

	/* 
	Below functions are related to error handling. 
	They can be used throughout the javascript code in this node to
    log various error message of a certain priority.
	The log level defined in the node-red settings file will determine
	which of these log messages will be displayed on the console.
	*/

	function LogFatal(message){
		RED.log.fatal(nodename + ": " + message);
	}

	function LogError(message){
		RED.log.error(nodename + ": " + message);
	}

	function LogWarning(message){
		RED.log.error(nodename + ": " + message);
	}
	
	function LogInfo(message){
		RED.log.info(nodename + ": " + message);
	}

	function LogDebug(message){
		RED.log.debug(nodename + ": " + message);
	}

	function LogTrace(message){
		RED.log.trace(nodename + ": " + message);
	}


	// If this node get's loaded, it will receive an object called 'RED'	
	// If the loglevel is set to tracing, we will dump this object to the console
	if (RED.settings.logging.console.level == "trace"){ 
		LogTrace("Received the following parameters from the runtime engine: \n\n" + JSON.stringify(RED) + "\n");
	}


	// Executing our python script

	var HAT = (function(){

        var fs = require("fs");
        var spawn = require("child_process").spawn;
        var cmd = __dirname+"/automationhatlink.o1";
        var hat = null;
        var allowExit = false;
        var reconnectTimer = null;
        var disconnectTimeout = null;
        var users = [];

        if ( !(fs.statSync(cmd).mode & 1) ) {
            LogError("Python script must be executable (755)");
	    throw "Error: '" + cmd + "' must be executable (755)";
        }

        process.env.PYTHONBUFFERED = 1;

        var connect = function() {
            if( reconnectTimer ) clearTimeout(reconnectTimer);

            reconnectTimer = null;
            allowExit = false;

            hat = spawn(cmd);

            users.forEach(function(node){
                node.status({fill:"green",shape:"dot",text:"Connected"});
            });

            function handleMessage(data){
                data = data.trim();
                if (data.length == 0) return;

                if (data.substring(0,5) == "ERROR"){
                    LogError(data);
                    return;
                }

                if (data.substring(0,5) == "FATAL"){
                    LogFatal(data);
		    throw "There was a fatal error, can't continue" + data;
                }
            }

            hat.stdout.on('data', function(data) {

		LogTrace("Received message from python script: " + data);

                data = data.toString().trim();
                if (data.length == 0) return;

                var messages = data.split("\n");
                messages.forEach(function(message){
                    handleMessage(message);
                });

            });

            hat.stderr.on('data', function(data) {
                LogError("Process Error: "+data+" :");

                hat.stdin.write("stop");
                hat.kill("SIGKILL");
            });

            hat.on('close', function(code) {
                LogWarning("Process Exit: "+code+" :");

                hat = null;
                users.forEach(function(node){
                    node.status({fill:"red",shape:"circle",text:"Disconnected"});
                });

                if (!allowExit && !reconnectTimer){
                    LogInfo("Attempting Reconnect");

                    reconnectTimer = setTimeout(function(){
                        connect();
                    },5000);
                }

            });

        }

        var disconnect = function(){
            disconnectTimeout = setTimeout(function(){
                if (hat !== null) {
                    allowExit = true;
                    hat.stdin.write("stop\n");
                    hat.kill("SIGKILL");
                }
            },3000);
            if (reconnectTimer) {
                clearTimeout(reconnedTimer);
            }

        }

        return {
            open: function(node){
                if (disconnectTimeout) clearTimeout(disconnectTimeout);
                if (!hat) connect();

                if(!reconnectTimer){
                    node.status({fill:"green",shape:"dot",text:"Connected"});
                }

                users.push(node);

                LogInfo("Adding node, count: " + users.length.toString());
            },
            close: function(node,done){
                users.splice(users.indexOf(node),1);
                
                LogInfo("Removing node, count: " + users.length.toString());

                if(users.length === 0){
                    disconnect();
                }
            },
            send: function(msg){
                if(hat) hat.stdin.write(msg+"\n");
            }
        }


    })();

    function AutomationhatOut(config) {
	RED.nodes.createNode(this,config);
 
        var node = this;

        HAT.open(this);

        node.on("input", function(msg) {
		    LogTrace("Node has incoming message...");
		    if ( (typeof msg.payload === "boolean") || (typeof msg.payload === "string") || (typeof msg.payload === "number") ){
                HAT.send(msg.payload);
                LogTrace("Sending " + typeof msg.payload + " message to python script, value is: " + msg.payload.toString());
            }
		

        });

        node.on("close", function(done) {
            done();
        });
    }

    RED.nodes.registerType("rpi-automationhat o1",AutomationhatOut);
}
