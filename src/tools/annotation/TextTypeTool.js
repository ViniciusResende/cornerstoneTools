import external from './../../externalModules.js';
import BaseAnnotationTool from '../base/BaseAnnotationTool.js';

import EVENTS from './../../events.js';
import toolColors from './../../stateManagement/toolColors.js';
import pointInsideBoundingBox from './../../util/pointInsideBoundingBox.js';
import triggerEvent from './../../util/triggerEvent.js';

import {
  addToolState,
  removeToolState,
  getToolState,
} from './../../stateManagement/toolState.js';
import drawTextBox from './../../drawing/drawTextBox.js';
import { getNewContext, draw, setShadow } from './../../drawing/index.js';
import { textMarkerCursor } from '../cursors/index.js';

/**
 * @public
 * @class TextTypeTool
 * @memberof Tools.Annotation
 *
 * @classdesc Tool for annotating an image with text typed.
 * @extends Tools.Base.BaseAnnotationTool
 */
export default class TextTypeTool extends BaseAnnotationTool {
  constructor(props = {}) {
    const defaultProps = {
      name: 'TextType',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        getTextCallback,
        changeTextCallback,
        color: undefined,
      },
      svgCursor: textMarkerCursor,
    };

    super(props, defaultProps);
    this.touchPressCallback = this._changeText.bind(this);
    this.doubleClickCallback = this._changeText.bind(this);
  }

  createNewMeasurement(eventData) {
    // Create the measurement data for this tool with the end handle activated
    return {
      visible: true,
      active: true,
      color: this.configuration.color,
      handles: {
        end: {
          x: eventData.detail.currentPoints.image.x,
          y: eventData.detail.currentPoints.image.y,
          highlight: true,
          active: false,
          hasBoundingBox: true,
          allowedOutsideImage: true,
        },
      },
    };
  }

  pointNearTool(_element, data, coords) {
    if (data.visible === false) {
      return false;
    }

    if (!data.handles.end.boundingBox) {
      return;
    }

    const distanceToPoint = external.cornerstoneMath.rect.distanceToPoint(
      data.handles.end.boundingBox,
      coords
    );
    const insideBoundingBox = pointInsideBoundingBox(data.handles.end, coords);

    const CONSIDERED_NEAR_DISTANCE = 10;

    return distanceToPoint < CONSIDERED_NEAR_DISTANCE || insideBoundingBox;
  }

  updateCachedStats() {
    // Implementing to satisfy BaseAnnotationTool
  }

  renderToolData(evt) {
    const { element, canvasContext } = evt.detail;
    const config = this.configuration;

    // If we have no toolData for this element, return immediately as there is nothing to do
    const toolData = getToolState(element, this.name);

    if (!toolData) {
      return;
    }

    // We have tool data for this element - iterate over each one and draw it
    const context = getNewContext(canvasContext.canvas);

    for (let i = 0; i < toolData.data.length; i++) {
      const data = toolData.data[i];

      if (data.visible === false) {
        continue;
      }

      const color = toolColors.getColorIfActive(data);

      draw(context, context => {
        setShadow(context, config);

        const textCoords = external.cornerstone.pixelToCanvas(
          element,
          data.handles.end
        );

        const options = {
          centering: {
            x: true,
            y: true,
          },
        };

        if (data.text) {
          data.handles.end.boundingBox = drawTextBox(
            context,
            data.text,
            textCoords.x,
            textCoords.y,
            color,
            options
          );
        }
      });
    }
  }

  addNewMeasurement(evt) {
    const element = evt.detail.element;
    const measurementData = this.createNewMeasurement(evt);

    // Associate this data with this imageId so we can render it and manipulate it
    addToolState(element, this.name, measurementData);
    external.cornerstone.updateImage(element);

    if (measurementData.text === undefined) {
      this.configuration.getTextCallback(text => {
        if (text) {
          measurementData.text = text;
          measurementData.active = false;

          const modifiedEventData = {
            toolName: this.name,
            toolType: this.name, // Deprecation notice: toolType will be replaced by toolName
            element,
            measurementData,
          };

          external.cornerstone.updateImage(element);
          triggerEvent(
            element,
            EVENTS.MEASUREMENT_COMPLETED,
            modifiedEventData
          );
        } else {
          removeToolState(element, this.name, measurementData);
        }
      }, evt.detail);
    }
  }

  _changeText(evt) {
    const eventData = evt.detail;
    const { element, currentPoints } = eventData;

    const config = this.configuration;
    const coords = currentPoints.canvas;

    // Now check to see if there is data to be changed
    const toolData = getToolState(element, this.name);

    if (!toolData) {
      return;
    }

    for (let i = 0; i < toolData.data.length; i++) {
      const data = toolData.data[i];

      if (this.pointNearTool(element, data, coords)) {
        data.active = true;
        external.cornerstone.updateImage(element);

        // Allow relabelling via a callback
        config.changeTextCallback(
          data,
          eventData,
          this._doneChangingTextCallback.bind(this, element, data)
        );

        evt.stopImmediatePropagation();
        evt.preventDefault();
        evt.stopPropagation();

        return;
      }
    }
  }

  /**
   * @callback doneChangingTextCallback
   * @param {Element} element - HTML element
   * @param {Object} data - Measurement data
   * @param {string} updatedText - The new text
   * @param {Boolean} deleteTool - If true remove tool state
   * @returns {void}
   */
  _doneChangingTextCallback(element, data, updatedText, deleteTool) {
    if (deleteTool === true) {
      removeToolState(element, this.name, data);
    } else {
      data.text = updatedText;
    }

    data.active = false;
    external.cornerstone.updateImage(element);

    triggerEvent(element, EVENTS.MEASUREMENT_MODIFIED, {
      toolName: this.name,
      toolType: this.name, // Deprecation notice: toolType will be replaced by toolName
      element,
      data,
    });
  }
}

/**
 * This function is a callback to be overwritten in order to provide the wanted feature
 * modal, overlay, popup or any kind of interaction with the user to be able to create
 * the text type label.
 *
 * @param  {doneChangingTextCallback} doneChangingTextCallback
 * @returns {void}
 */

function getTextCallback(doneChangingTextCallback) {
  // eslint-disable-next-line no-alert
  doneChangingTextCallback(prompt('Enter your annotation:'));
}

/**
 * This function is a callback to be overwritten in order to provide the wanted feature
 * modal, overlay, popup or any kind of interaction with the user to be able to update
 * the text type label.
 *
 * @param  {Object} data - Measurement data
 * @param  {Object} eventData - Click/Touch event data
 * @param  {doneChangingTextCallback} doneChangingTextCallback
 * @returns {void}
 */
const changeTextCallback = (data, eventData, doneChangingTextCallback) => {
  // eslint-disable-next-line no-alert
  doneChangingTextCallback(prompt('Change your annotation:'));
};
