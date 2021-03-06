(function() {
    // CloudFoundry Service
    angular.module('cfdeck').service('$cloudfoundry', function($http, $location, $log, $q) {

        // Declare variables for passing data via this service
        var orgs, activeOrg, activeSpace = {
            guid: undefined
        };

        // Attempts http request again if 503 is returned.
        function httpRetry(url) {
            var self = this,
                // This defer method allows us to return a promise and resolve
                // it later, without chaning multiple promises together.
                deferred = $q.defer(),
                counter = 0,
                finalResponse;
            // Function for getting and returning http request
            var get = function(url) {
                return $http.get(url).then(self.receive).catch(self.checkError);
            }
            // Function to receive an http request if no errors are present
            self.receive = function(response) {
                deferred.resolve(response);
            };
            // Check the type of error, if the error has been checked
            // over 10 time or the error is not a 503 return the response.
            // Otherwise retry the http get request
            self.checkError = function(response) {
                counter++;
                if (counter > 10) {
                    return response;
                } else if (response.status === 503) {
                    return get(url)
                } else {
                    return response;
                };
            };
            // Start the loop
            get(url);
            // Return a promise to return the final response
            return deferred.promise;
        }

        // Paging function for endpoints that require more than one page
        // TODO: Add httpRetry to httpPager, in its current form httpRetry 
        // will not continue the promise chain inside httpPager. 
        function httpPager(url, resources, loadComplete) {
            // Prevent JS scope bug
            var self = this,
                currentUrl,
                counter = 0;
            // Get the next url
            var get = function(nextUrl) {
                currentUrl = nextUrl;
                return $http.get(nextUrl).then(self.receive).catch(self.returnError);
            };
            // Receive response and add data
            self.receive = function(response) {
                resources.push.apply(resources, response.data.resources);
                if (response.data.next_url) {
                    return get(response.data.next_url);
                }
                self.setLoadComplete();
            };
            // Return error if needed
            self.returnError = function(response) {
                counter++;
                if (counter > 10) {
                    self.setLoadComplete();
                    return response;
                } else if (response.status === 503) {
                    get(currentUrl);
                } else {
                    return response;
                };
            };
            // Show that load has finished
            self.setLoadComplete = function() {
                loadComplete.status = true;
            };
            return get(url);
        };

        // Returns the authentication status from promise
        var returnAuthStatus = function(response) {
            return response.data.status
        };

        // Redirects back to home page
        this.returnHome = function(response) {
            $location.path('/');
            return {
                'status': 'unauthorized'
            };
        }

        // Get current authentication status from server
        this.getAuthStatus = function() {
            return $http.get('/v2/authstatus')
                .then(returnAuthStatus, returnAuthStatus);
        };

        this.isAuthorized = function() {
            return this.getAuthStatus()
                .then(function(status) {
                    if (status == "authorized") {
                        return true;
                    }
                    return false;
                });
        };

        // Delete Route
        this.deleteRoute = function(oldRoute) {
            return $http.delete('/v2/routes/' + oldRoute.guid)
                .then(function(response) {
                    return response.data;
                });
        };

        // Create a Route
        this.createRoute = function(newRoute, appGuid) {
            // Create the route
            return $http.post('/v2/routes?async=true&inline-relations-depth=1', newRoute)
                .then(function(response) {
                    // Map the route to the app
                    return $http.put('/v2/apps/' + appGuid + '/routes/' + response.data.metadata.guid)
                        .then(function(response) {
                            return response;
                        });
                })
                .catch(function(response) {
                    return response;
                });
        };

        // Get organizations
        this.getOrgs = function() {
            return $http.get('/v2/organizations')
                .then(function(response) {
                    return response.data.resources;
                });
        };

        // Get org details
        this.getOrgDetails = function(orgGuid) {
            return $http.get('/v2/organizations/' + orgGuid + '/summary')
                .then(function(response) {
                    return response.data;
                });
        };

        // Get an org's links
        this.getOrgLinks = function(org) {
            return $http.get('/v2/organizations/' + org.guid)
        };

        // Get quota usage data
        this.getQuotaUsage = function(org) {

            var quotadata = {};
            // Get a quota's memory limit
            var getMemoryLimit = function(response) {
                return $http.get(response.data.entity.quota_definition_url)
                    .then(function(response) {
                        quotadata.memory_limit = response.data.entity.memory_limit;
                    });
            };
            // Get a quota's memory usage
            var getOrgMemoryUsage = function() {
                return $http.get('/v2/organizations/' + org.guid + '/memory_usage')
                    .then(function(response) {
                        quotadata.used_memory = response.data.memory_usage_in_mb;
                    });
            };
            // Attached quota data, only if all promises succeed
            this.getOrgLinks(org)
                .then(getMemoryLimit)
                .then(getOrgMemoryUsage)
                .then(function() {
                    org.quota = quotadata;
                })
                .catch(function() {
                    $log.info('Failed to get quota usage');
                });
        };

        // Get org users
        this.getOrgUsers = function(orgGuid, resources, loadComplete) {
            return httpPager('/v2/organizations/' + orgGuid + '/user_roles', resources, loadComplete)
        };

	// Toggle user permissions
        this.toggleOrgUserPermissions = function(user, permissions, orgGuid) {
            var returnResponse = function(response) {
                return response;
            };
            var url = '/v2/organizations/' + orgGuid + '/' + permissions + '/' + user.metadata.guid;
            if (user[permissions]) {
                return $http.put(url).then(returnResponse).catch(returnResponse);
            } else {
                return $http.delete(url).then(returnResponse).catch(returnResponse);
            }
        };

        // Get space details
        this.getSpaceDetails = function(spaceGuid) {
            return httpRetry('/v2/spaces/' + spaceGuid + '/summary')
                .then(function(response) {
                    return response.data;
                });
        };

        this.findActiveSpace = function(spaceGuid, callback) {
            if (activeSpace.guid === spaceGuid) {
                $log.info('Use stored space data');
                callback(activeSpace);
            } else {
                this.getSpaceDetails(spaceGuid).then(function(spaceData) {
                    $log.info('Fetch new space data');
                    activeSpace = spaceData;
                    callback(spaceData);
                });
            }
        };

        // Get space users
        this.getSpaceUsers = function(spaceGuid) {
            return httpRetry('/v2/spaces/' + spaceGuid + '/user_roles')
                .then(function(response) {
                    return response.data.resources;
                });
        };

        // Toggle user permissions
        this.toggleSpaceUserPermissions = function(user, permissions, spaceGuid) {
            var returnResponse = function(response) {
                return response;
            };
            var url = '/v2/spaces/' + spaceGuid + '/' + permissions + '/' + user.metadata.guid;
            if (user[permissions]) {
                return $http.put(url).then(returnResponse).catch(returnResponse);
            } else {
                return $http.delete(url).then(returnResponse).catch(returnResponse);
            }
        };

        // Get services
        this.getOrgServices = function(guid) {
            return $http.get('/v2/organizations/' + guid + '/services')
                .then(function(response) {
                    return response.data.resources;
                });
        };

        // Get service plans for a service
        this.getServicePlans = function(servicePlanUrl) {
            return $http.get(servicePlanUrl)
                .then(function(response) {
                    return response.data.resources.map(function(plan) {
                        if (plan.entity.extra) {
                            plan.entity.extra = JSON.parse(plan.entity.extra);
                        }
                        return plan
                    });
                });
        };

        // Get service details for a service
        this.getServiceDetails = function(serviceGuid) {
            return $http.get('/v2/services/' + serviceGuid)
                .then(function(response) {
                    return response.data;
                });
        };

        // Functions for getting passed data
        this.setOrgsData = function(newOrgs) {
            orgs = newOrgs
        };

        // Get specific org data
        this.getOrgsData = function(callback) {
            if (!orgs) {
                $log.info('Downloaded New Org Data');
                return this.getOrgs().then(callback);
            }
            $log.info('Used cached data');
            return callback(orgs);
        };

        // Create a service instance
        this.createServiceInstance = function(requestBody) {
            return $http.post("/v2/service_instances?accepts_incomplete=true", requestBody)
                .then(function(response) {
                    return response;
                }, function(response) {
                    return response;
                });
        };

        // Delete unbound service Instance
        var deleteUnboundServiceInstance = function(service) {
            return $http.delete(service.metadata.url)
                .then(function(response) {
                    return response.data;
                }, function(response) {
                    return response.data;
                });
        };


        // Delete bound service instance, by undinding all services first
        var deleteBoundServiceInstance = function(service) {
            return $http.get(service.entity.service_bindings_url)
                .then(function(response) {
                    // Collect promises
                    var requestsPromises = response.data.resources.map(function(boundService) {
                        return $http.delete(boundService.metadata.url)
                    });
                    // Run promises and then delete service instance
                    return $q.all(requestsPromises)
                        .then(function() {
                            return deleteUnboundServiceInstance(service)
                        });
                });
        };

        // Delete a service instance
        this.deleteServiceInstance = function(service, bound) {
            if (!bound) {
                return deleteUnboundServiceInstance(service);
            } else {
                return deleteBoundServiceInstance(service);
            }
        };

        // Given an org guid attempts to find the active org data stored in the service
        this.findActiveOrg = function(orgGuid, callback) {
            // If the requested org is the same one stored, return it
            if (activeOrg && orgGuid === activeOrg.guid) {
                if (orgGuid === activeOrg.guid) {
                    $log.info('return the cached active org');
                    return callback(activeOrg);
                }
            }
            // If the orgs data hasn't been downloaded yet, get the active org from the api
            else {
                $log.info('get org data from api');
                return this.getOrgDetails(orgGuid).then(function(org) {
                    activeOrg = org;
                    callback(org);
                });
            }
        };

        // Get app summary
        this.getAppSummary = function(appGuid) {
            return $http.get('/v2/apps/' + appGuid + '/summary')
                .then(function(response) {
                    return response.data;
                });
        };

        // Get detailed app stats
        this.getAppStats = function(appGuid, appStarted) {
            return $http.get('/v2/apps/' + appGuid + '/stats')
                .then(function(response) {
                    return response.data;
		}, function(response) {
                    appStarted.value = !(response.status == 400); // If stats returned 400, stop for now.
                });
        };

	// Get app logs
        this.getAppLogs = function(appGuid) {
            return $http.get('/log/recent?app='+ appGuid)
                .then(function(response) {
                    return response.data;
                })
		.catch(function(err){console.log(err)});
        };

	// Get app events
        this.getAppEvents = function(appGuid) {
            return $http.get('/v2/events?order-direction=desc&q=actee:' + appGuid)
                .then(function(response) {
                    return response.data.resources;
                });
        };

	// Get all the services available to a space
        this.getSpaceServices = function(spaceGuid) {
            return $http.get('/v2/spaces/' + spaceGuid + '/service_instances')
                .then(function(response) {
                    return response.data.resources;
                });
        };

        // Bind a service instance to an app
        this.bindService = function(body) {
            return $http.post('/v2/service_bindings', body)
                .then(function(response) {
                    return response;
                }, function(response) {
                    return response;
                });
        };

        // Unbind a service instance from an app
        this.unbindService = function(data, callback) {
            // Look for service binding guid
            $http.get('/v2/apps/' + data.app_guid + '/service_bindings')
                .then(function(response) {
                    // Find the service binding that is attached to the current space
                    response.data.resources.forEach(function(boundService) {
                        if (boundService.entity.service_instance_guid === data.service_instance_guid) {
                            // Unbind the service and send back a message
                            return $http.delete(boundService.metadata.url)
                                .then(function(response) {
                                    callback(response);
                                });
                        };
                    });
                });
        };

        // Get service credentials
        this.getServiceCredentials = function(service) {
            // Look for service binding guid
            return $http.get(service.entity.service_bindings_url)
                .then(function(response) {
                    // Find the service binding that is attached to the current space
                    return response.data.resources.filter(function(boundService) {
                        return boundService.entity.space_guid === service.space_guid;
                    })[0].entity.credentials;
                });
        };


        // Tells whether the web app should poll for newer app statuses.
        // Useful for when we are in the middle of updating the app status ourselves and we don't
        // want a poll to interrupt the UI.
        var pollAppStatus = true;
        // Getter function for pollAppStatus.
        this.getPollAppStatusProperty = function() {
            return pollAppStatus;
        };
        // Setter function for pollAppStatus.
        var setPollAppStatusProperty = function(value) {
            pollAppStatus = value;
        };
        // Internal generic function that actually submits the request to backend to change the app.
        this.changeAppState = function(app, desired_state) {
            setPollAppStatusProperty(false); // prevent UI from refreshing.
            return $http.put("/v2/apps/" + app.guid + "?async=false&inline-relations-depth=1", {
                    "state": desired_state
                })
                .then(function(response) {
                    // Success
                    // Set the state immediately to stop so that UI will force a load of the new options.
                    // UI will change the buttons based on the state.
                    app.state = desired_state;
                }, function(response) {
                    // Failure
                }).finally(function() {
                    setPollAppStatusProperty(true); // allow UI to refresh via polling again.
                });
        };
        // Wrapper function that will submit a request to start an app.
        this.startApp = function(app) {
            return this.changeAppState(app, "STARTED");
        };
        // Wrapper function that will submit a request to stop an app.
        this.stopApp = function(app) {
            return this.changeAppState(app, "STOPPED");
        };
        // Wrapper function that will submit a request to restart an app.
        this.restartApp = function(app) {
            // _this = this allows us to access another service method again within a promise.
            _this = this;
            return this.changeAppState(app, "STOPPED")
                .then(function() {
                    return _this.changeAppState(app, "STARTED");
                });
        };

    });

}());
