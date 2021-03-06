(function() {
    'use strict';
    // Get the app
    var app = angular.module('cfdeck');


    app.directive('serviceDestroyer', function($cloudfoundry, $route) {
        return {
            templateUrl: 'app/views/partials/service_destroyer.html',
            controller: function($scope) {
                $scope.view = {
                    status: 'unconfirmed',
                    disableButton: false,
                };
                $scope.view.showDestroyer = function(state) {
                    $scope.view.status = state;
                };
                $scope.view.deleteService = function(service, bound) {
                    $scope.view.disableButton = true;
                    $cloudfoundry.deleteServiceInstance(service, bound)
                        .then(function(response) {
                            if (response.code === undefined) {
                                $scope.view.status = "success";
                                $route.reload();
                            } else if (response.code === 10006) {
                                $scope.view.status = "boundError";
                            } else {
                                $scope.view.status = "error";
                            }
                            $scope.view.disableButton = false;
                        });
                };
            }
        };
    });
    app.directive('deckHeader', function($cloudfoundry, $uaa, MenuData) {
        return {
            templateUrl: 'app/views/partials/header.html',
            controller: function($scope, $location) {
                // Initalize menudata
                $scope.MenuData = MenuData;

                // Render the orgs on the page
                var renderOrgs = function(orgs) {
                    $scope.orgs = orgs;
                    $cloudfoundry.setOrgsData(orgs);
                };
                var renderName = function(name) {
                    $scope.givenName = name;
                    // Load user's permissions
                    $uaa.getUsersPermissions('managed_organizations')
                        // Only allow navigation when names are loaded
                    $scope.authorized = true;
                };
                // Get the auth status
                $cloudfoundry.getAuthStatus().then(function(status) {
                    if (status === "authorized") {
                        // Load the org data
                        $cloudfoundry.getOrgsData(renderOrgs);
                        // Load username
                        $uaa.getUserInfoGivenName().then(renderName);
                    } else {
                        $scope.authorized = false;
                        $location.path('/');
                    }
                });
            }
        };
    });
    app.directive('cloudStatus', function($window) {
        return {
            templateUrl: 'app/views/partials/status.html',
            controller: function($scope, $http, $window, $interval) {
                var sp = new StatusPage.page({
                    page: 'swcbylb1c30f'
                });
                var loadStatus = function(sp) {
                    sp.status({
                        success: function(data) {
                            $scope.$apply(function() {
                                $scope.statuspagecolor = "statuspagecolor-light " + data.status.indicator;
                            });
                        }
                    })
                };
                // Set up the poll to call loadStatus(sp) every 10 seconds.
                var poll = $interval(function() {
                    loadStatus(sp);
                }, 10000);
                // Call loadStatus(sp) for the first time.
                loadStatus(sp);
                // Destroy the poll when the page is left to clean up.
                $scope.$on('$destroy', function() {
                    $interval.cancel(poll);
                });

            },
            link: function($scope) {
                $scope.goto = function() {
                    $window.open('https://cloudgov.statuspage.io/');
                };
            }
        };
    });
}());
